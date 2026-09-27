-- 16_driver_hardening.sql
-- Hardens the driver-dashboard feature added in 15_drivers.sql. Paste into
-- Supabase Studio's SQL Editor and run AFTER 15_drivers.sql (which is
-- already applied to this project's live database — this is a follow-up
-- migration, not an edit to that file).
--
-- What this closes and why:
--
-- (a) "anyone insert orders" (02_rls.sql) was `with check (true)` — any
--     anonymous request could INSERT a row straight into `orders` with an
--     arbitrary `driver_id` and `status` (e.g. pre-assigned to a driver and
--     already `out_for_delivery`), landing a forged order on that driver's
--     page and in the owner's queue. Audited every insert path into
--     `orders` in the app before deciding how to tighten this:
--       - `create_order` (06_orders.sql) is the *only* path the app code
--         uses to create an order (storefront checkout, via
--         lib/actions/order-actions.ts -> createOrder ->
--         supabase.rpc("create_order", ...); the POS order builder,
--         components/dashboard/pos-order-builder.tsx, also calls this same
--         `createOrder` action). It is SECURITY DEFINER, so it runs as its
--         owner and is not subject to the `orders` insert policy at all —
--         it always hard-codes `status = 'received'` and never sets
--         `driver_id` in its INSERT column list (the column is left to its
--         NULL default). It is unaffected by this migration.
--       - No other file in the app calls `.from("orders").insert(...)`
--         directly (grepped `\.insert\(` and `from("orders")` /
--         `from('orders')` across app/, components/, lib/) — every order
--         write besides `create_order` goes through
--         `advanceOrderStatus`/driver RPCs, which are UPDATEs, not INSERTs.
--     Since nothing in the app needs the anon INSERT policy to allow a
--     non-'received' status or a non-null driver_id, the policy is
--     tightened to exactly what an honest checkout submits, with no
--     is_staff_of() escape hatch needed.
-- (b) Defence in depth: the four driver-side/customer-side SECURITY DEFINER
--     functions from 15_drivers.sql already scope by driver_id/token, but
--     none of them re-checked that the order and the driver share a
--     restaurant_id. There's no known way to reach that mismatch today
--     (assign_order_driver already refuses to assign a driver to another
--     restaurant's order), but scoping every driver-facing function by
--     restaurant_id closes the gap permanently against any future insert
--     or assignment path that might not re-derive it correctly.
--
-- pgcrypto lives in Supabase's `extensions` schema; with search_path = ''
-- its functions must be schema-qualified (same note as 15_drivers.sql).

-- ---------------------------------------------------------------------------
-- (a) Tighten the anonymous order-insert policy
-- ---------------------------------------------------------------------------

drop policy if exists "anyone insert orders" on orders;
create policy "anyone insert orders" on orders for insert
  with check (driver_id is null and status = 'received');

-- ---------------------------------------------------------------------------
-- (b) Scope driver-facing SECURITY DEFINER functions to their own restaurant
-- ---------------------------------------------------------------------------

-- Copied verbatim from 15_drivers.sql, only adding
-- "and o.restaurant_id = v_driver.restaurant_id" to the orders filter.
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
        and o.restaurant_id = v_driver.restaurant_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Copied verbatim from 15_drivers.sql, only adding
-- "and restaurant_id = v_driver.restaurant_id" to the UPDATE WHERE and to
-- the not_assigned re-check.
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
    and restaurant_id = v_driver.restaurant_id
  returning * into v_order;

  if v_order.id is null then
    perform 1 from public.orders where id = p_order_id and driver_id = v_driver.id and restaurant_id = v_driver.restaurant_id;
    if not found then
      raise exception 'not_assigned';
    end if;
    raise exception 'bad_status';
  end if;

  insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
  values (v_order.restaurant_id, v_order.id, v_driver.id, 'picked_up', 'driver');
end;
$$;

-- Copied verbatim from 15_drivers.sql, only adding
-- "and restaurant_id = v_driver.restaurant_id" to the UPDATE WHERE and to
-- the not_assigned re-check.
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
    and restaurant_id = v_driver.restaurant_id
  returning * into v_order;

  if v_order.id is null then
    perform 1 from public.orders where id = p_order_id and driver_id = v_driver.id and restaurant_id = v_driver.restaurant_id;
    if not found then
      raise exception 'not_assigned';
    end if;
    raise exception 'bad_status';
  end if;

  insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
  values (v_order.restaurant_id, v_order.id, v_driver.id, 'delivered', 'driver');
end;
$$;

-- Copied verbatim from 15_drivers.sql, only adding
-- "and d.restaurant_id = o.restaurant_id" to the WHERE clause.
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
    and o.status in ('received', 'preparing', 'out_for_delivery')
    and d.restaurant_id = o.restaurant_id;
$$;

-- ---------------------------------------------------------------------------
-- Grants — restated exactly as 15_drivers.sql for clarity. `create or
-- replace` keeps a function's existing grants, so these are not strictly
-- necessary, but Supabase's default privileges only bite on brand-new
-- functions — restating them here documents the intended, unchanged grants
-- for these four re-defined functions.
-- ---------------------------------------------------------------------------

revoke execute on function driver_get_orders(text) from public, anon, authenticated;
grant execute on function driver_get_orders(text) to anon, authenticated;
revoke execute on function driver_mark_picked_up(text, uuid) from public, anon, authenticated;
grant execute on function driver_mark_picked_up(text, uuid) to anon, authenticated;
revoke execute on function driver_mark_delivered(text, uuid) from public, anon, authenticated;
grant execute on function driver_mark_delivered(text, uuid) to anon, authenticated;

revoke execute on function get_order_driver(uuid) from public, anon, authenticated;
grant execute on function get_order_driver(uuid) to anon, authenticated;
