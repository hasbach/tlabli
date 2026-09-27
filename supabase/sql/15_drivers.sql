-- 15_drivers.sql
-- Driver management + magic-link driver page. Paste into Supabase Studio's
-- SQL Editor and run AFTER 01–14. See
-- docs/superpowers/specs/2026-09-27-driver-dashboard-design.md.
--
-- Drivers have no Supabase account. Each gets a private link
-- /driver/<token>; only sha256(token) is stored here. Driver-side functions
-- are SECURITY DEFINER and check the token AND the order's current driver_id
-- on every call, so a reassigned or reset driver loses access immediately.
-- Owner-side functions are SECURITY INVOKER so the existing
-- "staff manage drivers" / "staff update orders" RLS policies authorize them.
--
-- pgcrypto lives in Supabase's `extensions` schema; with search_path = ''
-- its functions must be schema-qualified.

alter table drivers
  add column if not exists active boolean not null default true,
  add column if not exists token_hash text unique,
  add column if not exists token_created_at timestamptz;

create table if not exists order_driver_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  event text not null check (event in ('assigned','unassigned','picked_up','delivered')),
  actor text not null check (actor in ('staff','driver'))
);
create index if not exists order_driver_events_order_id_idx on order_driver_events (order_id);
create index if not exists order_driver_events_restaurant_id_idx on order_driver_events (restaurant_id);

-- Append-only for staff: no update/delete policy exists. Driver-side rows are
-- written by the SECURITY DEFINER functions below.
alter table order_driver_events enable row level security;
drop policy if exists "staff read order_driver_events" on order_driver_events;
create policy "staff read order_driver_events" on order_driver_events for select
  using (is_staff_of(restaurant_id));
drop policy if exists "staff insert order_driver_events" on order_driver_events;
create policy "staff insert order_driver_events" on order_driver_events for insert
  with check (is_staff_of(restaurant_id) and actor = 'staff');

-- ---------------------------------------------------------------------------
-- Token helpers
-- ---------------------------------------------------------------------------

create or replace function driver_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Returns the active driver owning this token, or a NULL row. Not granted to
-- anyone (revoked from public, anon, and authenticated below) — only called
-- from the SECURITY DEFINER functions below, which run with the definer's
-- own privileges. It must never be reachable directly: it is SECURITY
-- DEFINER and returns the full drivers row, including token_hash.
create or replace function driver_from_token(p_token text)
returns public.drivers
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
  from public.drivers d
  where p_token is not null
    and length(p_token) = 48
    and d.token_hash = public.driver_token_hash(p_token)
    and d.active;
$$;

-- ---------------------------------------------------------------------------
-- Owner-side (SECURITY INVOKER — RLS does the authorization)
-- ---------------------------------------------------------------------------

create or replace function reset_driver_link(p_driver_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token text;
  v_updated integer;
begin
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  update public.drivers
  set token_hash = public.driver_token_hash(v_token),
      token_created_at = now()
  where id = p_driver_id and active;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'driver_not_found_or_inactive';
  end if;

  return v_token;
end;
$$;

create or replace function assign_order_driver(p_order_id uuid, p_driver_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders;
  v_driver public.drivers;
begin
  -- FOR UPDATE both serializes against a driver's concurrent status change
  -- and, under RLS, only returns the row if "staff update orders" passes.
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if v_order.order_type <> 'delivery' then
    raise exception 'not_a_delivery_order';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'order_finished';
  end if;
  if v_order.driver_id is not distinct from p_driver_id then
    return;
  end if;

  if p_driver_id is not null then
    -- FOR SHARE: blocks on a concurrent set_driver_active(false) for this
    -- driver until it commits, so this can never assign an order to a driver
    -- that deactivation just unassigned everything from.
    select * into v_driver from public.drivers where id = p_driver_id for share;
    if v_driver.id is null or v_driver.restaurant_id <> v_order.restaurant_id then
      raise exception 'driver_not_found';
    end if;
    if not v_driver.active then
      raise exception 'driver_inactive';
    end if;
  end if;

  if v_order.driver_id is not null then
    insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
    values (v_order.restaurant_id, v_order.id, v_order.driver_id, 'unassigned', 'staff');
  end if;

  update public.orders set driver_id = p_driver_id where id = v_order.id;

  if p_driver_id is not null then
    insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
    values (v_order.restaurant_id, v_order.id, p_driver_id, 'assigned', 'staff');
  end if;
end;
$$;

create or replace function set_driver_active(p_driver_id uuid, p_active boolean)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_driver public.drivers;
  v_unassigned integer := 0;
begin
  select * into v_driver from public.drivers where id = p_driver_id for update;
  if v_driver.id is null then
    raise exception 'driver_not_found';
  end if;

  if p_active then
    update public.drivers set active = true where id = p_driver_id;
    return 0;
  end if;

  update public.drivers
  set active = false, token_hash = null, token_created_at = null
  where id = p_driver_id;

  -- Single statement: the set of orders unassigned and the set of orders
  -- logged are read from the same CTE, so they can never disagree.
  with u as (
    update public.orders
    set driver_id = null
    where driver_id = p_driver_id and status not in ('completed', 'cancelled')
    returning restaurant_id, id
  )
  insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
  select u.restaurant_id, u.id, p_driver_id, 'unassigned', 'staff'
  from u;
  get diagnostics v_unassigned = row_count;

  return v_unassigned;
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver-side (SECURITY DEFINER — token is the only credential)
-- ---------------------------------------------------------------------------

create or replace function driver_get_orders(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver public.drivers;
  v_restaurant public.restaurants;
begin
  v_driver := public.driver_from_token(p_token);
  if v_driver.id is null then
    raise exception 'invalid_link';
  end if;

  select * into v_restaurant from public.restaurants where id = v_driver.restaurant_id;

  return jsonb_build_object(
    'driver', jsonb_build_object('name', v_driver.name),
    'restaurant', jsonb_build_object(
      'name', v_restaurant.name,
      'phone', v_restaurant.phone,
      'show_both_currencies', v_restaurant.show_both_currencies,
      'lbp_exchange_rate', v_restaurant.lbp_exchange_rate
    ),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'queue_number', o.queue_number,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'address', o.address,
        'items', o.items,
        'total', o.total,
        'currency', o.currency,
        'status', o.status,
        'created_at', o.created_at
      ) order by o.queue_number)
      from public.orders o
      where o.driver_id = v_driver.id
        and o.order_type = 'delivery'
        and o.status in ('received', 'preparing', 'out_for_delivery')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function driver_mark_picked_up(p_token text, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver public.drivers;
  v_order public.orders;
begin
  v_driver := public.driver_from_token(p_token);
  if v_driver.id is null then
    raise exception 'invalid_link';
  end if;

  -- Assignment check and update in one statement: a reassignment racing this
  -- tap can never let the old driver move the order.
  update public.orders
  set status = 'out_for_delivery'
  where id = p_order_id
    and driver_id = v_driver.id
    and order_type = 'delivery'
    and status in ('received', 'preparing')
  returning * into v_order;

  if v_order.id is null then
    perform 1 from public.orders where id = p_order_id and driver_id = v_driver.id;
    if not found then
      raise exception 'not_assigned';
    end if;
    raise exception 'bad_status';
  end if;

  insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
  values (v_order.restaurant_id, v_order.id, v_driver.id, 'picked_up', 'driver');
end;
$$;

create or replace function driver_mark_delivered(p_token text, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver public.drivers;
  v_order public.orders;
begin
  v_driver := public.driver_from_token(p_token);
  if v_driver.id is null then
    raise exception 'invalid_link';
  end if;

  update public.orders
  set status = 'completed'
  where id = p_order_id
    and driver_id = v_driver.id
    and order_type = 'delivery'
    and status = 'out_for_delivery'
  returning * into v_order;

  if v_order.id is null then
    perform 1 from public.orders where id = p_order_id and driver_id = v_driver.id;
    if not found then
      raise exception 'not_assigned';
    end if;
    raise exception 'bad_status';
  end if;

  insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
  values (v_order.restaurant_id, v_order.id, v_driver.id, 'delivered', 'driver');
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer tracking page (SECURITY DEFINER — exposes only name + phone while
-- the order is in progress; drivers stays staff-only under RLS)
-- ---------------------------------------------------------------------------

create or replace function get_order_driver(p_order_id uuid)
returns table (name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.name, d.phone
  from public.orders o
  join public.drivers d on d.id = o.driver_id
  where o.id = p_order_id
    and o.status in ('received', 'preparing', 'out_for_delivery');
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Supabase grants EXECUTE on new public-schema functions to anon,
-- authenticated, and service_role by default (default privileges), so
-- `revoke ... from public` alone is not enough — it must be revoked from
-- anon and authenticated explicitly too, then re-granted only where intended.
revoke execute on function driver_token_hash(text) from public, anon, authenticated;
grant execute on function driver_token_hash(text) to authenticated;

revoke execute on function driver_from_token(text) from public, anon, authenticated;

revoke execute on function reset_driver_link(uuid) from public, anon, authenticated;
grant execute on function reset_driver_link(uuid) to authenticated;
revoke execute on function assign_order_driver(uuid, uuid) from public, anon, authenticated;
grant execute on function assign_order_driver(uuid, uuid) to authenticated;
revoke execute on function set_driver_active(uuid, boolean) from public, anon, authenticated;
grant execute on function set_driver_active(uuid, boolean) to authenticated;

revoke execute on function driver_get_orders(text) from public, anon, authenticated;
grant execute on function driver_get_orders(text) to anon, authenticated;
revoke execute on function driver_mark_picked_up(text, uuid) from public, anon, authenticated;
grant execute on function driver_mark_picked_up(text, uuid) to anon, authenticated;
revoke execute on function driver_mark_delivered(text, uuid) from public, anon, authenticated;
grant execute on function driver_mark_delivered(text, uuid) to anon, authenticated;

revoke execute on function get_order_driver(uuid) from public, anon, authenticated;
grant execute on function get_order_driver(uuid) to anon, authenticated;
