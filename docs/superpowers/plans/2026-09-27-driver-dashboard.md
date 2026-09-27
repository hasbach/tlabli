# Driver Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners add drivers and assign/reassign delivery orders. Each driver gets a private magic link (`/driver/<token>`) where they mark their orders Picked up → Delivered. Customers see the assigned driver on their tracking page.

**Architecture:** A single migration (`15_drivers.sql`) adds driver link/active columns, an append-only `order_driver_events` log, and plpgsql RPCs. Owner RPCs run as `security invoker`, so existing RLS authorizes them. Driver and customer RPCs run as `security definer`, take the token (or order id), and do their own narrow checks. The Next.js side is Server Actions plus three UI surfaces: the Drivers card in Settings, the driver select in the order queue, and the public `/driver/[token]` page.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + RLS + pgcrypto in the `extensions` schema), `@supabase/ssr`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-27-driver-dashboard-design.md`

## Global Constraints

- The token is 48 hex chars (`encode(extensions.gen_random_bytes(24), 'hex')`). Only `encode(extensions.digest(token, 'sha256'), 'hex')` is stored, in `drivers.token_hash`.
- The token or `token_hash` is never sent to the browser, except the plaintext token returned once by `reset_driver_link` so the owner can share it.
- Every SQL function uses `set search_path = ''` and schema-qualified names (`public.`, `extensions.`), matching `05_auth.sql` / `06_orders.sql`.
- Every function gets `revoke execute ... from public` and then an explicit `grant`. Driver/customer RPCs go to `anon, authenticated`; owner RPCs go to `authenticated` only.
- Driver RPC error codes are exactly `invalid_link`, `not_assigned`, `bad_status`. Owner RPC error codes are exactly `driver_not_found_or_inactive`, `driver_not_found`, `driver_inactive`, `order_not_found`, `not_a_delivery_order`, `order_finished`.
- Only `order_type = 'delivery'` orders can have a driver.
- Mappers must tolerate the migration not being applied yet (fall back like `mapRestaurantRow` does). Embedded order→driver selects use only `id, name, phone`, which exist pre-migration.
- There is no automated JS test framework in this repo. Verification is `npm run lint`, `npm run build`, the SQL smoke test in Task 1, and the manual pass in Task 7. Don't add a test framework.
- Commit messages follow the repo style (`feat: ...`, `fix: ...`, `docs: ...`) and end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Deliberate deviations from the spec (both are small, and the user should hear about them):**
1. The one-time link panel is an inline panel inside the Drivers card, not a modal. There's no dialog primitive in `components/ui` beyond `sheet`, and an inline panel is simpler. The link is built from `window.location.origin` rather than `NEXT_PUBLIC_SITE_URL`. In production the origin *is* the site URL, and in dev it avoids links that point at `https://tlabli.com` from `.env.example`.
2. Today the queue hides "Advance" on delivery orders that are `out_for_delivery` (they wait for a driver). Once drivers can be unassigned, that could leave orders stuck. So the owner gets a **Delivered** override button there, which advances the order to `completed`. Owner status changes stay unlogged, as they are today. Only assignment and driver actions are logged.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/sql/15_drivers.sql` | Create | Columns, events table and RLS, all RPCs and grants |
| `supabase/sql/tests/15_drivers_smoke.sql` | Create | Transaction-wrapped assertions for every RPC, ending in rollback |
| `lib/types.ts` | Modify | `Driver.active`, `Driver.linkCreatedAt`, `Order.driverId` |
| `lib/mock-data.ts` | Modify | Add `active: true` to the demo driver so it still compiles |
| `lib/supabase/mappers.ts` | Modify | `mapDriverRow`, `ORDER_WITH_DRIVER_SELECT`, `mapOrderRow` maps driver |
| `lib/actions/driver-actions.ts` | Create | Owner Server Actions: add/edit/reset/activate driver, assign order |
| `components/dashboard/drivers-section.tsx` | Create | Drivers card in Settings |
| `app/dashboard/settings/page.tsx` | Modify | Load drivers and active-order counts, render the card |
| `components/dashboard/order-queue-board.tsx` | Modify | Driver select, "No driver" badge, realtime driver mapping, Delivered override |
| `app/dashboard/orders/page.tsx`, `app/dashboard/page.tsx` | Modify | Load active drivers, embed driver in order selects |
| `app/order/[orderId]/page.tsx` | Modify | Show driver via `get_order_driver` RPC |
| `lib/i18n/dictionaries.ts` | Modify | `driver*` keys in en/ar/fr |
| `lib/driver-view.ts` | Create | Server helper: calls `driver_get_orders`, maps it to a typed view |
| `lib/actions/driver-page-actions.ts` | Create | Driver Server Actions: mark picked up / delivered |
| `components/driver/driver-dashboard.tsx` | Create | Driver page client UI (polling, actions, language) |
| `app/driver/[token]/page.tsx` | Create | Public driver route |
| `next.config.mjs` | Modify | `Referrer-Policy: no-referrer` + `X-Robots-Tag` for `/driver/*` |
| `SETUP_TODO.md`, `README.md` | Modify | Migration step, route listing, remove the "driver works" implication |

---

### Task 1: Migration `15_drivers.sql` + SQL smoke test

**Files:**
- Create: `supabase/sql/15_drivers.sql`
- Create: `supabase/sql/tests/15_drivers_smoke.sql`

**Interfaces:**
- Consumes: `public.is_staff_of(uuid)` from `02_rls.sql`; tables `drivers`, `orders`, `restaurants` from `01_schema.sql`.
- Produces (called by later tasks through `supabase.rpc(name, args)`):
  - `reset_driver_link(p_driver_id uuid) returns text`: the plaintext token
  - `assign_order_driver(p_order_id uuid, p_driver_id uuid) returns void`: a null driver unassigns
  - `set_driver_active(p_driver_id uuid, p_active boolean) returns integer`: the number of orders unassigned
  - `driver_get_orders(p_token text) returns jsonb`: `{ driver: {name}, restaurant: {name, phone, show_both_currencies, lbp_exchange_rate}, orders: [{id, queue_number, customer_name, customer_phone, address, items, total, currency, status, created_at}] }`
  - `driver_mark_picked_up(p_token text, p_order_id uuid) returns void`
  - `driver_mark_delivered(p_token text, p_order_id uuid) returns void`
  - `get_order_driver(p_order_id uuid) returns table (name text, phone text)`
  - New columns `drivers.active boolean`, `drivers.token_hash text`, `drivers.token_created_at timestamptz`

- [ ] **Step 1: Write the failing smoke test**

Create `supabase/sql/tests/15_drivers_smoke.sql`:

```sql
-- 15_drivers_smoke.sql
-- Smoke test for 15_drivers.sql. Paste into Supabase Studio's SQL Editor and
-- run AFTER 15_drivers.sql. Runs entirely inside a transaction that is rolled
-- back at the end, so it leaves no data behind. Success = the notice
-- "drivers smoke test: all assertions passed" and no error.
--
-- The SQL Editor runs as `postgres`, which bypasses RLS — so this checks the
-- functions' own logic (token checks, assignment rules, status rules, event
-- log), not the RLS scoping of the security-invoker owner functions. That part
-- is covered by the manual pass in the plan's final task.

begin;

do $$
declare
  v_restaurant uuid;
  v_driver_a uuid;
  v_driver_b uuid;
  v_order uuid;
  v_order2 uuid;
  v_pickup_order uuid;
  v_token_a text;
  v_token_b text;
  v_old_token text;
  v_json jsonb;
  v_ok boolean;
begin
  insert into public.restaurants (name, slug, type, template_id)
  values ('Smoke Test', 'smoke-test-drivers-' || gen_random_uuid(), 'fast-food', 'fast-food')
  returning id into v_restaurant;

  insert into public.drivers (restaurant_id, name, phone) values (v_restaurant, 'Driver A', '+96170000001')
  returning id into v_driver_a;
  insert into public.drivers (restaurant_id, name, phone) values (v_restaurant, 'Driver B', '+96170000002')
  returning id into v_driver_b;

  insert into public.orders (restaurant_id, queue_number, customer_name, customer_phone, order_type, address, items, total, currency)
  values (v_restaurant, 1, 'Customer', '+96170000003', 'delivery', 'Hamra St', '[]', 10, 'USD')
  returning id into v_order;

  -- Links: 48 hex chars, stored hashed.
  v_token_a := public.reset_driver_link(v_driver_a);
  v_token_b := public.reset_driver_link(v_driver_b);
  assert length(v_token_a) = 48, 'token is 48 chars';
  assert (select token_hash from public.drivers where id = v_driver_a) <> v_token_a, 'token stored hashed, not plaintext';
  assert (select token_created_at from public.drivers where id = v_driver_a) is not null, 'token_created_at set';

  -- Bad token rejected.
  begin
    perform public.driver_get_orders('not-a-real-token');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'invalid_link';
  end;
  assert v_ok, 'bad token raises invalid_link';

  -- Assign A: only A sees it; customer sees the driver.
  perform public.assign_order_driver(v_order, v_driver_a);
  v_json := public.driver_get_orders(v_token_a);
  assert jsonb_array_length(v_json->'orders') = 1, 'driver A sees the assigned order';
  assert v_json->'driver'->>'name' = 'Driver A', 'driver name returned';
  assert jsonb_array_length(public.driver_get_orders(v_token_b)->'orders') = 0, 'driver B sees nothing';
  assert (select count(*) from public.get_order_driver(v_order)) = 1, 'customer sees the driver';

  -- Picked up.
  perform public.driver_mark_picked_up(v_token_a, v_order);
  assert (select status from public.orders where id = v_order) = 'out_for_delivery', 'picked up -> out_for_delivery';

  -- Reassign to B: A is locked out.
  perform public.assign_order_driver(v_order, v_driver_b);
  begin
    perform public.driver_mark_delivered(v_token_a, v_order);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'not_assigned';
  end;
  assert v_ok, 'reassigned-away driver gets not_assigned';

  -- Wrong transition for B.
  begin
    perform public.driver_mark_picked_up(v_token_b, v_order);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'bad_status';
  end;
  assert v_ok, 'picking up an out_for_delivery order gets bad_status';

  -- B delivers.
  perform public.driver_mark_delivered(v_token_b, v_order);
  assert (select status from public.orders where id = v_order) = 'completed', 'delivered -> completed';
  assert (select count(*) from public.get_order_driver(v_order)) = 0, 'customer no longer sees driver after completion';

  -- Finished orders can't be reassigned.
  begin
    perform public.assign_order_driver(v_order, v_driver_a);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'order_finished';
  end;
  assert v_ok, 'assigning a completed order gets order_finished';

  -- Event log: assigned A, picked_up, unassigned A, assigned B, delivered.
  assert (select count(*) from public.order_driver_events where order_id = v_order) = 5, 'five events logged';
  assert (select count(*) from public.order_driver_events where order_id = v_order and actor = 'driver') = 2, 'two driver events';

  -- Reset link: old token dies, new one works.
  v_old_token := v_token_b;
  v_token_b := public.reset_driver_link(v_driver_b);
  begin
    perform public.driver_get_orders(v_old_token);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'invalid_link';
  end;
  assert v_ok, 'old token invalid after reset';
  perform public.driver_get_orders(v_token_b);

  -- Deactivate: unassigns active orders and kills the link.
  insert into public.orders (restaurant_id, queue_number, customer_name, customer_phone, order_type, address, items, total, currency)
  values (v_restaurant, 2, 'Customer 2', '+96170000004', 'delivery', 'Achrafieh', '[]', 5, 'USD')
  returning id into v_order2;
  perform public.assign_order_driver(v_order2, v_driver_b);
  assert public.set_driver_active(v_driver_b, false) = 1, 'deactivate unassigns one order';
  assert (select driver_id from public.orders where id = v_order2) is null, 'order2 unassigned';
  begin
    perform public.driver_get_orders(v_token_b);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'invalid_link';
  end;
  assert v_ok, 'deactivated driver link is dead';

  -- Inactive drivers can't be assigned or get a new link.
  begin
    perform public.assign_order_driver(v_order2, v_driver_b);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'driver_inactive';
  end;
  assert v_ok, 'assigning an inactive driver gets driver_inactive';
  begin
    perform public.reset_driver_link(v_driver_b);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'driver_not_found_or_inactive';
  end;
  assert v_ok, 'resetting an inactive driver link fails';

  -- Pickup orders can't have a driver.
  insert into public.orders (restaurant_id, queue_number, customer_name, customer_phone, order_type, items, total, currency)
  values (v_restaurant, 3, 'Customer 3', '+96170000005', 'pickup', '[]', 5, 'USD')
  returning id into v_pickup_order;
  begin
    perform public.assign_order_driver(v_pickup_order, v_driver_a);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'not_a_delivery_order';
  end;
  assert v_ok, 'pickup order rejects a driver';

  raise notice 'drivers smoke test: all assertions passed';
end $$;

rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run the file in Supabase Studio's SQL Editor. If the Supabase MCP `execute_sql` tool is available *and the user has approved running SQL against their project*, you may run it that way instead. Otherwise hand the file to the user.
Expected: FAIL with `function public.reset_driver_link(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/sql/15_drivers.sql`:

```sql
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
create policy "staff read order_driver_events" on order_driver_events for select
  using (is_staff_of(restaurant_id));
create policy "staff insert order_driver_events" on order_driver_events for insert
  with check (is_staff_of(restaurant_id));

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
-- anyone — only called from the SECURITY DEFINER functions below.
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
    select * into v_driver from public.drivers where id = p_driver_id;
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

  insert into public.order_driver_events (restaurant_id, order_id, driver_id, event, actor)
  select o.restaurant_id, o.id, o.driver_id, 'unassigned', 'staff'
  from public.orders o
  where o.driver_id = p_driver_id and o.status not in ('completed', 'cancelled');

  update public.orders
  set driver_id = null
  where driver_id = p_driver_id and status not in ('completed', 'cancelled');
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

revoke execute on function driver_token_hash(text) from public;
grant execute on function driver_token_hash(text) to authenticated;

revoke execute on function driver_from_token(text) from public;

revoke execute on function reset_driver_link(uuid) from public;
grant execute on function reset_driver_link(uuid) to authenticated;
revoke execute on function assign_order_driver(uuid, uuid) from public;
grant execute on function assign_order_driver(uuid, uuid) to authenticated;
revoke execute on function set_driver_active(uuid, boolean) from public;
grant execute on function set_driver_active(uuid, boolean) to authenticated;

revoke execute on function driver_get_orders(text) from public;
grant execute on function driver_get_orders(text) to anon, authenticated;
revoke execute on function driver_mark_picked_up(text, uuid) from public;
grant execute on function driver_mark_picked_up(text, uuid) to anon, authenticated;
revoke execute on function driver_mark_delivered(text, uuid) from public;
grant execute on function driver_mark_delivered(text, uuid) to anon, authenticated;

revoke execute on function get_order_driver(uuid) from public;
grant execute on function get_order_driver(uuid) to anon, authenticated;
```

- [ ] **Step 4: Apply the migration and re-run the smoke test**

Run `15_drivers.sql`, then `tests/15_drivers_smoke.sql`, the same way as Step 2. Applying it to the live project needs the user's go-ahead. If you don't have it, stop here and hand both files over.
Expected: the notice `drivers smoke test: all assertions passed`, no error, and the transaction rolled back.

- [ ] **Step 5: Commit**

```bash
git add supabase/sql/15_drivers.sql supabase/sql/tests/15_drivers_smoke.sql
git commit -m "feat: add driver links, assignment RPCs, and order_driver_events (15_drivers.sql)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Types, mappers, and owner Server Actions

**Files:**
- Modify: `lib/types.ts` (`Driver` interface ~line 109, `Order` interface ~line 115)
- Modify: `lib/mock-data.ts:433`
- Modify: `lib/supabase/mappers.ts`
- Create: `lib/actions/driver-actions.ts`

**Interfaces:**
- Consumes: the Task 1 RPCs `reset_driver_link`, `assign_order_driver`, `set_driver_active`.
- Produces:
  - `Driver { id: string; name: string; phone: string; active: boolean; linkCreatedAt?: string }`
  - `Order.driverId?: string`
  - `mapDriverRow(row: Record<string, unknown>): Driver`
  - `ORDER_WITH_DRIVER_SELECT = "*, driver:drivers(id, name, phone)"`
  - From `lib/actions/driver-actions.ts`, each returning `Promise<ActionResult<...>>` where `ActionResult<T> = { error: string } | { data: T }`:
    - `addDriver(name: string, phone: string)` → `{ driver: Driver; token: string | null }`
    - `updateDriver(driverId: string, name: string, phone: string)` → `Driver`
    - `resetDriverLink(driverId: string)` → `{ token: string; linkCreatedAt: string }`
    - `setDriverActive(driverId: string, active: boolean)` → `{ unassigned: number }`
    - `assignOrderDriver(orderId: string, driverId: string | null)` → `true`

- [ ] **Step 1: Extend the types**

In `lib/types.ts`, replace the `Driver` interface with:

```ts
export interface Driver {
  id: string;
  name: string;
  phone: string;
  /** Inactive drivers can't be assigned and their link doesn't work. */
  active: boolean;
  /** When the current link was issued; undefined = no working link. Never holds the token itself. */
  linkCreatedAt?: string;
}
```

In the `Order` interface, add this directly above `driver?: Driver;`:

```ts
  driverId?: string;
```

- [ ] **Step 2: Run the type check to see it fail**

Run: `npx tsc --noEmit`
Expected: FAIL. `lib/mock-data.ts` errors with `Property 'active' is missing in type ... but required in type 'Driver'`.

- [ ] **Step 3: Fix the mock driver and add the mappers**

In `lib/mock-data.ts:433`, change the line to:

```ts
const driverJoe: Driver = { id: "d-1", name: "Jad K.", phone: "+96171987654", active: true };
```

In `lib/supabase/mappers.ts`, add `Driver` to the type import:

```ts
import type { Restaurant, MenuCategory, MenuItem, ItemAddon, Order, OrderLineItem, StaffUser, Subscription, WhatsAppSettings, Driver } from "@/lib/types";
```

Add this above `mapOrderRow`:

```ts
// Staff pages embed the assigned driver in their order queries with this
// select. Only id/name/phone — columns that exist even before
// 15_drivers.sql runs, so the queue keeps loading pre-migration.
export const ORDER_WITH_DRIVER_SELECT = "*, driver:drivers(id, name, phone)";

export function mapDriverRow(row: Record<string, unknown>): Driver {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    // Falls back to the SQL column default (15_drivers.sql) so drivers still
    // list correctly before that migration is applied.
    active: (row.active as boolean | null | undefined) ?? true,
    linkCreatedAt: (row.token_created_at as string) ?? undefined,
  };
}
```

In `mapOrderRow`, replace the line `driver: undefined,` with:

```ts
    driverId: (row.driver_id as string) ?? undefined,
    driver: row.driver ? mapDriverRow(row.driver as Record<string, unknown>) : undefined,
```

- [ ] **Step 4: Create the owner Server Actions**

Create `lib/actions/driver-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapDriverRow } from "@/lib/supabase/mappers";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import type { Driver } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

// Error codes raised by the RPCs in supabase/sql/15_drivers.sql.
const RPC_ERROR_MESSAGES: Record<string, string> = {
  driver_not_found_or_inactive: "This driver is inactive — reactivate them first.",
  driver_not_found: "That driver no longer exists.",
  driver_inactive: "That driver is inactive — reactivate them in Settings first.",
  order_not_found: "That order no longer exists.",
  not_a_delivery_order: "Only delivery orders can have a driver.",
  order_finished: "This order is already completed or cancelled.",
};

function friendlyError(message: string): string {
  return RPC_ERROR_MESSAGES[message] ?? message;
}

function revalidateDriverViews() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/settings");
}

export async function addDriver(name: string, phone: string): Promise<ActionResult<{ driver: Driver; token: string | null }>> {
  const current = await getCurrentRestaurant();
  if (!current) return { error: "Not authorized" };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("drivers")
    .insert({ restaurant_id: current.restaurant.id, name: name.trim(), phone: phone.trim() })
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to add driver" };

  // The driver row stays even if issuing the link fails — the owner can
  // retry with "Reset link", so token is nullable instead of rolling back.
  const { data: token, error: tokenError } = await supabase.rpc("reset_driver_link", { p_driver_id: data.id });
  const issued = !tokenError && typeof token === "string" ? token : null;

  revalidateDriverViews();
  return {
    data: {
      driver: { ...mapDriverRow(data), linkCreatedAt: issued ? new Date().toISOString() : undefined },
      token: issued,
    },
  };
}

export async function updateDriver(driverId: string, name: string, phone: string): Promise<ActionResult<Driver>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("drivers")
    .update({ name: name.trim(), phone: phone.trim() })
    .eq("id", driverId)
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to update driver" };
  revalidateDriverViews();
  return { data: mapDriverRow(data) };
}

export async function resetDriverLink(driverId: string): Promise<ActionResult<{ token: string; linkCreatedAt: string }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("reset_driver_link", { p_driver_id: driverId });
  if (error || typeof data !== "string") return { error: friendlyError(error?.message ?? "Failed to reset link") };
  revalidateDriverViews();
  return { data: { token: data, linkCreatedAt: new Date().toISOString() } };
}

export async function setDriverActive(driverId: string, active: boolean): Promise<ActionResult<{ unassigned: number }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_driver_active", { p_driver_id: driverId, p_active: active });
  if (error) return { error: friendlyError(error.message) };
  revalidateDriverViews();
  return { data: { unassigned: Number(data ?? 0) } };
}

export async function assignOrderDriver(orderId: string, driverId: string | null): Promise<ActionResult<true>> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("assign_order_driver", { p_order_id: orderId, p_driver_id: driverId });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { data: true };
}
```

- [ ] **Step 5: Run the type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/mock-data.ts lib/supabase/mappers.ts lib/actions/driver-actions.ts
git commit -m "feat: add driver types, mappers, and owner driver Server Actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Drivers card in Settings

**Files:**
- Create: `components/dashboard/drivers-section.tsx`
- Modify: `app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `addDriver`, `updateDriver`, `resetDriverLink`, `setDriverActive` (Task 2); `mapDriverRow` (Task 2); `buildWhatsAppLink(phone, message)` from `lib/whatsapp.ts`.
- Produces: `<DriversSection restaurant={Restaurant} initialDrivers={Driver[]} activeOrderCounts={Record<string, number>} />`, rendered in a wrapper with `id="drivers"` so the queue can link to `/dashboard/settings#drivers`.

- [ ] **Step 1: Create the component**

Create `components/dashboard/drivers-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, Link2, MessageCircle, Pencil } from "lucide-react";
import type { Driver, Restaurant } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { addDriver, resetDriverLink, setDriverActive, updateDriver } from "@/lib/actions/driver-actions";

interface IssuedLink {
  driver: Driver;
  url: string;
}

export function DriversSection({
  restaurant,
  initialDrivers,
  activeOrderCounts,
}: {
  restaurant: Restaurant;
  initialDrivers: Driver[];
  activeOrderCounts: Record<string, number>;
}) {
  const [drivers, setDrivers] = useState(initialDrivers);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function linkFor(token: string) {
    return `${window.location.origin}/driver/${token}`;
  }

  function showLink(driver: Driver, token: string) {
    setCopied(false);
    setIssued({ driver, url: linkFor(token) });
  }

  function replaceDriver(updated: Driver) {
    setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  async function add() {
    if (!name.trim() || !phone.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addDriver(name, phone);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setDrivers((prev) => [...prev, result.data.driver]);
    setName("");
    setPhone("");
    if (result.data.token) {
      showLink(result.data.driver, result.data.token);
    } else {
      setError(`${result.data.driver.name} was added, but their link couldn't be created — tap "Reset link" to try again.`);
    }
  }

  function startEdit(driver: Driver) {
    setEditingId(driver.id);
    setEditName(driver.name);
    setEditPhone(driver.phone);
  }

  async function saveEdit(driver: Driver) {
    if (!editName.trim() || !editPhone.trim()) return;
    setError(null);
    const result = await updateDriver(driver.id, editName, editPhone);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    replaceDriver({ ...result.data, linkCreatedAt: driver.linkCreatedAt });
    setEditingId(null);
  }

  async function reset(driver: Driver) {
    if (driver.linkCreatedAt && !window.confirm(`${driver.name}'s current link will stop working. Create a new one?`)) return;
    setError(null);
    setNotice(null);
    const result = await resetDriverLink(driver.id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const updated = { ...driver, linkCreatedAt: result.data.linkCreatedAt };
    replaceDriver(updated);
    showLink(updated, result.data.token);
  }

  async function toggleActive(driver: Driver) {
    const activeCount = activeOrderCounts[driver.id] ?? 0;
    if (driver.active) {
      const extra = activeCount > 0 ? ` ${activeCount} active order${activeCount === 1 ? "" : "s"} will be unassigned.` : "";
      if (!window.confirm(`Deactivate ${driver.name}? Their link will stop working.${extra}`)) return;
    }
    setError(null);
    setNotice(null);
    const result = await setDriverActive(driver.id, !driver.active);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    replaceDriver({ ...driver, active: !driver.active, linkCreatedAt: driver.active ? undefined : driver.linkCreatedAt });
    if (issued?.driver.id === driver.id) setIssued(null);
    if (driver.active && result.data.unassigned > 0) {
      setNotice(`${result.data.unassigned} order${result.data.unassigned === 1 ? "" : "s"} unassigned — reassign them from the order queue.`);
    }
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically — select the link and copy it manually.");
    }
  }

  const whatsappHref = issued
    ? buildWhatsAppLink(
        issued.driver.phone,
        `Hi ${issued.driver.name}, this is your delivery link for ${restaurant.name}. Open it to see the orders assigned to you: ${issued.url}`
      )
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drivers</CardTitle>
        <p className="text-sm text-muted-foreground">
          Each driver gets a private link — no password. Assign delivery orders from the order queue; drivers mark
          them picked up and delivered from their link.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {issued && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold">Link for {issued.driver.name}</p>
            <Input readOnly value={issued.url} onFocus={(e) => e.currentTarget.select()} className="mt-2 font-mono text-xs" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" asChild className="gap-1.5">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" /> Send on WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                Done
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This link won&apos;t be shown again. If it&apos;s lost, reset it to get a new one.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {drivers.length === 0 && <p className="text-sm text-muted-foreground">No drivers yet — add your first one below.</p>}
          {drivers.map((driver) => (
            <div key={driver.id} className="rounded-lg border border-border p-3">
              {editingId === driver.id ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Driver name" />
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} aria-label="Driver phone" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(driver)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold">
                      {driver.name}
                      <Badge variant={driver.active ? "success" : "muted"}>{driver.active ? "Active" : "Inactive"}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {driver.phone} ·{" "}
                      {driver.linkCreatedAt
                        ? `Link active since ${new Date(driver.linkCreatedAt).toLocaleDateString()}`
                        : "No link yet"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(driver)} aria-label={`Edit ${driver.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {driver.active && (
                      <Button size="sm" variant="outline" onClick={() => reset(driver)} className="gap-1.5">
                        <Link2 className="h-3.5 w-3.5" /> {driver.linkCreatedAt ? "Reset link" : "Create link"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(driver)}>
                      {driver.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="driver-name">Name</Label>
            <Input id="driver-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Driver name" />
          </div>
          <div>
            <Label htmlFor="driver-phone">WhatsApp phone</Label>
            <Input id="driver-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 7X XXX XXX" />
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={!name.trim() || !phone.trim() || busy} className="w-full">
              {busy ? "Adding…" : "Add driver"}
            </Button>
          </div>
        </div>
        {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the Settings page**

In `app/dashboard/settings/page.tsx`:

Add these imports:

```tsx
import { DriversSection } from "@/components/dashboard/drivers-section";
```

and change the mappers import to:

```tsx
import { mapDriverRow, mapStaffUserRow, mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
```

Replace the `Promise.all` block and the two lines after it with:

```tsx
  const [{ data: staffRows }, { data: whatsappSettingsRow }, { count: sentThisMonth }, { data: driverRows }, { data: assignedRows }] =
    await Promise.all([
      supabase.from("staff_users").select("*").eq("restaurant_id", restaurant.id),
      supabase.from("whatsapp_settings").select("*").eq("restaurant_id", restaurant.id).maybeSingle(),
      supabase
        .from("whatsapp_message_log")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id)
        .eq("status", "sent")
        .gte("created_at", startOfMonthISO),
      supabase.from("drivers").select("*").eq("restaurant_id", restaurant.id).order("name"),
      supabase
        .from("orders")
        .select("driver_id")
        .eq("restaurant_id", restaurant.id)
        .not("driver_id", "is", null)
        .not("status", "in", "(completed,cancelled)"),
    ]);

  const staff = (staffRows ?? []).map(mapStaffUserRow);
  const whatsappSettings = whatsappSettingsRow ? mapWhatsAppSettingsRow(whatsappSettingsRow) : null;
  const drivers = (driverRows ?? []).map(mapDriverRow);
  const activeOrderCounts: Record<string, number> = {};
  for (const row of assignedRows ?? []) {
    const id = row.driver_id as string;
    activeOrderCounts[id] = (activeOrderCounts[id] ?? 0) + 1;
  }
```

After the `TeamSection` wrapper `div`, add:

```tsx
      <div id="drivers" className="mt-6 scroll-mt-6">
        <DriversSection restaurant={restaurant} initialDrivers={drivers} activeOrderCounts={activeOrderCounts} />
      </div>
```

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS. `/dashboard/settings` is listed in the build output.

- [ ] **Step 4: Verify in the browser**

Start the dev server with the preview tools (add a `dev` entry to `.claude/launch.json` running `npm run dev` on port 3000 if one isn't there). Log in as an owner and open `/dashboard/settings`.
Check that:
- The Drivers card renders, including the seeded demo drivers.
- Adding a driver shows the link panel with Copy / Send on WhatsApp.
- Reset link asks for confirmation and shows a new URL.
- Deactivate flips the badge and hides the link button.
- There are no errors in the console.
If `15_drivers.sql` isn't applied yet, link creation shows an error message. That's expected. Note it and don't treat it as a failure.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/drivers-section.tsx app/dashboard/settings/page.tsx
git commit -m "feat: add Drivers card to Settings with one-time magic link sharing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Driver assignment in the order queue

**Files:**
- Modify: `components/dashboard/order-queue-board.tsx`
- Modify: `app/dashboard/orders/page.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `assignOrderDriver` (Task 2); `ORDER_WITH_DRIVER_SELECT`, `mapDriverRow`, `mapOrderRow` (Task 2); `Order.driverId`, `Driver` (Task 2).
- Produces: `OrderQueueBoard` gains the required prop `drivers: Driver[]` (active drivers only).

- [ ] **Step 1: Update the board's imports, props and realtime mapping**

In `components/dashboard/order-queue-board.tsx`:

Replace the first import block (through `import type { PrintJob, PrintRole } from "./print-ticket";`) with:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Printer, Store, Truck, Utensils, X } from "lucide-react";
import type { Driver, Order } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { OrderStatusBadge, nextStatus } from "./order-status-badge";
import { advanceOrderStatus } from "@/lib/actions/order-actions";
import { assignOrderDriver } from "@/lib/actions/driver-actions";
import { supabase } from "@/lib/supabase/client";
import { PrintTicket } from "./print-ticket";
import type { PrintJob, PrintRole } from "./print-ticket";
```

Add `drivers` to the destructured props and to the prop type:

```tsx
  receiptWidthMm,
  drivers,
  limit,
}: {
  ...
  receiptWidthMm: number;
  drivers: Driver[];
  limit?: number;
}) {
```

(Keep the existing prop type fields. Only insert `drivers: Driver[];` before `limit?: number;`.)

Directly after `const [printJob, setPrintJob] = useState<PrintJob | null>(null);`, add:

```tsx
  const [assignError, setAssignError] = useState<string | null>(null);
  // The realtime handler is registered once per restaurant; read drivers
  // through a ref so it always resolves driver_id against the latest list.
  const driversRef = useRef(drivers);
  driversRef.current = drivers;
```

In the realtime handler, replace `driver: undefined,` with:

```tsx
              driverId: (row.driver_id as string) ?? undefined,
              driver: driversRef.current.find((d) => d.id === row.driver_id),
```

- [ ] **Step 2: Add the assign handler**

Directly after the `cancel` function, add:

```tsx
  async function assignDriver(order: Order, driverId: string | null) {
    if ((order.driverId ?? null) === driverId) return;
    if (order.status === "out_for_delivery" && order.driverId) {
      const current = order.driver?.name ?? "The current driver";
      if (!window.confirm(`${current} already picked this order up. Reassign anyway?`)) return;
    }
    const driver = drivers.find((d) => d.id === driverId);
    setAssignError(null);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, driverId: driverId ?? undefined, driver } : o)));
    const result = await assignOrderDriver(order.id, driverId);
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, driverId: order.driverId, driver: order.driver } : o)));
      setAssignError(result.error);
    }
  }
```

- [ ] **Step 3: Render the driver select and the Delivered override**

At the start of the returned fragment, directly after `<>`, add:

```tsx
      {assignError && <p className="mb-3 text-sm text-destructive">{assignError}</p>}
```

In the order card, directly after the closing `</div>` of the customer-name/type block (the `div` containing `order.customerName`), add:

```tsx
                  {order.orderType === "delivery" && (
                    <div className="flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {drivers.length === 0 ? (
                        <Link href="/dashboard/settings#drivers" className="text-xs text-primary underline">
                          Add a driver
                        </Link>
                      ) : (
                        <select
                          aria-label={`Driver for order #${order.queueNumber}`}
                          value={order.driverId ?? ""}
                          onChange={(e) => assignDriver(order, e.target.value || null)}
                          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {!order.driverId && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          No driver
                        </span>
                      )}
                    </div>
                  )}
```

In the footer, delete this block (the driver name now lives in the select):

```tsx
                      {(order.status === "out_for_delivery" && order.orderType === "delivery") && (
                        <span className="text-xs text-muted-foreground">{order.driver?.name}</span>
                      )}
```

Replace the conditional Advance button:

```tsx
                      {(order.status !== "out_for_delivery" || order.orderType !== "delivery") && (
                        <Button size="sm" variant="outline" onClick={() => advance(order.id)} className="gap-1">
                          Advance <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
```

with (owner override so an unassigned or unreachable driver can't leave an order stuck):

```tsx
                      <Button size="sm" variant="outline" onClick={() => advance(order.id)} className="gap-1">
                        {order.status === "out_for_delivery" && order.orderType === "delivery" ? "Delivered" : "Advance"}{" "}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
```

- [ ] **Step 4: Load drivers and embed them in the order queries**

In `app/dashboard/orders/page.tsx`:
- Change the mappers import to `import { mapDriverRow, mapOrderRow, ORDER_WITH_DRIVER_SELECT } from "@/lib/supabase/mappers";`
- In both order queries, change `.select("*")` to `.select(ORDER_WITH_DRIVER_SELECT)`.
- Add a third query to the `Promise.all` and destructure it as `{ data: driverRows }`:

```tsx
    supabase.from("drivers").select("*").eq("restaurant_id", restaurant.id).order("name"),
```

- After `const completed = ...`, add:

```tsx
  const drivers = (driverRows ?? []).map(mapDriverRow).filter((d) => d.active);
```

- Pass `drivers={drivers}` to `<OrderQueueBoard ... />`.

In `app/dashboard/page.tsx`:
- Change the mappers import to `import { mapDriverRow, mapOrderRow, ORDER_WITH_DRIVER_SELECT } from "@/lib/supabase/mappers";`
- Change the orders query's `.select("*")` to `.select(ORDER_WITH_DRIVER_SELECT)`.
- Change the `Promise.all` to destructure `const [{ data: orderRows }, analytics, { data: driverRows }] = await Promise.all([` and add as the third entry:

```tsx
    supabase.from("drivers").select("*").eq("restaurant_id", restaurant.id).order("name"),
```

- After `const orders = ...`, add `const drivers = (driverRows ?? []).map(mapDriverRow).filter((d) => d.active);`
- Pass `drivers={drivers}` to `<OrderQueueBoard ... />`.

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS. A missing `drivers` prop anywhere shows up as a type error. Fix it by passing the prop.

- [ ] **Step 6: Verify in the browser**

With the dev server running and `15_drivers.sql` applied, place a delivery order on a storefront and open `/dashboard/orders`.
Check that:
- The card shows the driver select with a "No driver" badge.
- Picking a driver removes the badge and survives a reload.
- On an `out_for_delivery` order, changing the driver asks for confirmation, and cancelling keeps the old driver selected.
- Pickup and table orders have no select.
- The Delivered button completes an `out_for_delivery` delivery order.
- There are no console errors.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/order-queue-board.tsx app/dashboard/orders/page.tsx app/dashboard/page.tsx
git commit -m "feat: assign and reassign drivers on delivery orders in the queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Show the driver on the customer tracking page

**Files:**
- Modify: `app/order/[orderId]/page.tsx`

**Interfaces:**
- Consumes: the `get_order_driver(p_order_id uuid)` RPC (Task 1), which returns rows of `{ name, phone }`.

- [ ] **Step 1: Fetch the driver through the RPC**

In `app/order/[orderId]/page.tsx`, directly after `const restaurant = restaurantRow ? mapRestaurantRow(restaurantRow) : null;`, add:

```tsx
  // drivers is staff-only under RLS; this SECURITY DEFINER RPC exposes just
  // name + phone while the order is in progress (15_drivers.sql). Before that
  // migration runs the call errors, data is null, and the card stays hidden.
  const { data: driverRows } = await supabase.rpc("get_order_driver", { p_order_id: order.id });
  const driver = (driverRows as { name: string; phone: string }[] | null)?.[0] ?? null;
```

Replace every `order.driver` in the JSX with `driver`: the condition `{order.driver && (` becomes `{driver && (`, `{order.driver.name}` becomes `{driver.name}`, and `` href={`tel:${order.driver.phone}`} `` becomes `` href={`tel:${driver.phone}`} ``.

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS.

- [ ] **Step 3: Verify in the browser**

Open `/order/<id>` for the delivery order assigned in Task 4. Check that the "Your driver" card shows the driver's name and a Call button. Unassign the driver in the queue, reload, and check that the card disappears. Complete the order and check that the card stays hidden.

- [ ] **Step 4: Commit**

```bash
git add "app/order/[orderId]/page.tsx"
git commit -m "fix: show the assigned driver on the customer order tracking page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Public driver page `/driver/[token]`

**Files:**
- Modify: `lib/i18n/dictionaries.ts`
- Create: `lib/driver-view.ts`
- Create: `lib/actions/driver-page-actions.ts`
- Create: `components/driver/driver-dashboard.tsx`
- Create: `app/driver/[token]/page.tsx`
- Modify: `next.config.mjs`

**Interfaces:**
- Consumes: the `driver_get_orders`, `driver_mark_picked_up`, `driver_mark_delivered` RPCs (Task 1); `LocaleProvider`/`useLocale` (`lib/i18n/LocaleProvider.tsx`); `LanguageSwitcher` (`components/storefront/language-switcher.tsx`); `formatMoney`, `formatDualCurrency` (`lib/currency.ts`).
- Produces:
  - `getDriverView(token: string): Promise<DriverViewResult>`
  - `type DriverViewResult = { kind: "ok"; view: DriverView } | { kind: "invalid" } | { kind: "error" }`
  - `markPickedUp(token: string, orderId: string): Promise<DriverActionResult>` and `markDelivered(...)`, where `DriverActionResult = { ok: true } | { ok: false; code: "invalid_link" | "not_assigned" | "bad_status" | "unknown" }`

- [ ] **Step 1: Add the translation keys**

In `lib/i18n/dictionaries.ts`, add these keys at the end of the `en` object (after `trackOrder`):

```ts
    driverGreeting: "Hi",
    driverRefresh: "Refresh",
    driverNoOrders: "No deliveries assigned right now.",
    driverOrder: "Order",
    driverCall: "Call",
    driverOpenMaps: "Open in Maps",
    driverToCollect: "To collect",
    driverPickedUp: "Picked up",
    driverDelivered: "Delivered",
    driverConfirmDelivered: "Mark this order as delivered?",
    driverReassigned: "This order was reassigned.",
    driverAlreadyUpdated: "This order was already updated.",
    driverUpdateFailed: "Couldn't update, try again.",
    driverLoadFailed: "Couldn't load your deliveries. Try again.",
    driverLinkInactive: "This link is no longer active. Ask the restaurant for a new one.",
    driverStatusReceived: "New",
    driverStatusPreparing: "Preparing",
    driverStatusOnTheWay: "On the way",
```

At the end of the `ar` object:

```ts
    driverGreeting: "مرحبا",
    driverRefresh: "تحديث",
    driverNoOrders: "ما في توصيلات إلك هلق.",
    driverOrder: "طلب",
    driverCall: "اتصال",
    driverOpenMaps: "افتح عالخريطة",
    driverToCollect: "المبلغ المطلوب",
    driverPickedUp: "استلمت الطلب",
    driverDelivered: "تم التوصيل",
    driverConfirmDelivered: "أكيد تم توصيل هالطلب؟",
    driverReassigned: "تم تحويل هالطلب لسائق تاني.",
    driverAlreadyUpdated: "هالطلب تحدّث من قبل.",
    driverUpdateFailed: "ما زبط التحديث، جرّب مرة تانية.",
    driverLoadFailed: "ما قدرنا نحمّل التوصيلات. جرّب مرة تانية.",
    driverLinkInactive: "هالرابط ما عاد شغّال. اطلب رابط جديد من المطعم.",
    driverStatusReceived: "جديد",
    driverStatusPreparing: "عم يتحضّر",
    driverStatusOnTheWay: "بالطريق",
```

At the end of the `fr` object:

```ts
    driverGreeting: "Bonjour",
    driverRefresh: "Actualiser",
    driverNoOrders: "Aucune livraison assignée pour le moment.",
    driverOrder: "Commande",
    driverCall: "Appeler",
    driverOpenMaps: "Ouvrir dans Maps",
    driverToCollect: "À encaisser",
    driverPickedUp: "Récupérée",
    driverDelivered: "Livrée",
    driverConfirmDelivered: "Marquer cette commande comme livrée ?",
    driverReassigned: "Cette commande a été réassignée.",
    driverAlreadyUpdated: "Cette commande a déjà été mise à jour.",
    driverUpdateFailed: "Échec de la mise à jour, réessayez.",
    driverLoadFailed: "Impossible de charger vos livraisons. Réessayez.",
    driverLinkInactive: "Ce lien n'est plus actif. Demandez-en un nouveau au restaurant.",
    driverStatusReceived: "Nouvelle",
    driverStatusPreparing: "En préparation",
    driverStatusOnTheWay: "En route",
```

- [ ] **Step 2: Create the server view helper**

Create `lib/driver-view.ts`:

```ts
// Server-only: loads what a driver's magic link is allowed to see, via the
// driver_get_orders SECURITY DEFINER RPC (supabase/sql/15_drivers.sql). The
// token is the only credential — no session is involved.

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Currency, OrderLineItem, OrderStatus } from "@/lib/types";

export interface DriverViewOrder {
  id: string;
  queueNumber: number;
  customerName: string;
  customerPhone: string;
  address?: string;
  items: OrderLineItem[];
  total: number;
  currency: Currency;
  status: OrderStatus;
  createdAt: string;
}

export interface DriverView {
  driverName: string;
  restaurantName: string;
  restaurantPhone: string;
  showBothCurrencies: boolean;
  lbpExchangeRate: number;
  orders: DriverViewOrder[];
}

export type DriverViewResult = { kind: "ok"; view: DriverView } | { kind: "invalid" } | { kind: "error" };

export async function getDriverView(token: string): Promise<DriverViewResult> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("driver_get_orders", { p_token: token });
  if (error) return error.message === "invalid_link" ? { kind: "invalid" } : { kind: "error" };

  const json = data as {
    driver: { name: string };
    restaurant: { name: string; phone: string; show_both_currencies: boolean; lbp_exchange_rate: number };
    orders: Record<string, unknown>[];
  };

  return {
    kind: "ok",
    view: {
      driverName: json.driver.name,
      restaurantName: json.restaurant.name,
      restaurantPhone: json.restaurant.phone,
      showBothCurrencies: json.restaurant.show_both_currencies,
      lbpExchangeRate: Number(json.restaurant.lbp_exchange_rate),
      orders: json.orders.map((o) => ({
        id: o.id as string,
        queueNumber: o.queue_number as number,
        customerName: o.customer_name as string,
        customerPhone: o.customer_phone as string,
        address: (o.address as string) ?? undefined,
        items: o.items as OrderLineItem[],
        total: Number(o.total),
        currency: o.currency as Currency,
        status: o.status as OrderStatus,
        createdAt: o.created_at as string,
      })),
    },
  };
}
```

- [ ] **Step 3: Create the driver Server Actions**

Create `lib/actions/driver-page-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DriverActionCode = "invalid_link" | "not_assigned" | "bad_status" | "unknown";
export type DriverActionResult = { ok: true } | { ok: false; code: DriverActionCode };

const KNOWN_CODES: DriverActionCode[] = ["invalid_link", "not_assigned", "bad_status"];

async function callDriverRpc(
  fn: "driver_mark_picked_up" | "driver_mark_delivered",
  token: string,
  orderId: string
): Promise<DriverActionResult> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc(fn, { p_token: token, p_order_id: orderId });
  revalidatePath(`/driver/${token}`);
  if (!error) return { ok: true };
  const code = KNOWN_CODES.find((c) => c === error.message) ?? "unknown";
  return { ok: false, code };
}

export async function markPickedUp(token: string, orderId: string): Promise<DriverActionResult> {
  return callDriverRpc("driver_mark_picked_up", token, orderId);
}

export async function markDelivered(token: string, orderId: string): Promise<DriverActionResult> {
  return callDriverRpc("driver_mark_delivered", token, orderId);
}
```

- [ ] **Step 4: Create the client dashboard**

Create `components/driver/driver-dashboard.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Phone, RefreshCw, Truck } from "lucide-react";
import type { Locale, OrderStatus } from "@/lib/types";
import type { DriverViewOrder, DriverViewResult } from "@/lib/driver-view";
import type { DictionaryKey } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/storefront/language-switcher";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDualCurrency, formatMoney } from "@/lib/currency";
import { markDelivered, markPickedUp, type DriverActionCode } from "@/lib/actions/driver-page-actions";

const REFRESH_MS = 30_000;
const LOCALE_STORAGE_KEY = "tlabli-driver-locale";

const STATUS_KEY: Partial<Record<OrderStatus, DictionaryKey>> = {
  received: "driverStatusReceived",
  preparing: "driverStatusPreparing",
  out_for_delivery: "driverStatusOnTheWay",
};

const ERROR_KEY: Record<DriverActionCode, DictionaryKey> = {
  invalid_link: "driverLinkInactive",
  not_assigned: "driverReassigned",
  bad_status: "driverAlreadyUpdated",
  unknown: "driverUpdateFailed",
};

export function DriverDashboard({ token, result }: { token: string; result: DriverViewResult }) {
  const router = useRouter();
  const { t, locale, setLocale } = useLocale();
  const [isRefreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  // Remember the driver's language on this phone (per-device convenience only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === "en" || saved === "ar" || saved === "fr") setLocale(saved as Locale);
    } catch {
      // Storage blocked (private mode) — fall back to the default language.
    }
  }, [setLocale]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore — see above.
    }
  }, [locale]);

  // Poll instead of Realtime: the driver has no session, and we don't want to
  // build on the public orders read policy (a known gap).
  useEffect(() => {
    const id = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function act(order: DriverViewOrder, kind: "picked_up" | "delivered") {
    if (kind === "delivered" && !window.confirm(`#${order.queueNumber} — ${t("driverConfirmDelivered")}`)) return;
    setPendingId(order.id);
    setMessage(null);
    const res = kind === "picked_up" ? await markPickedUp(token, order.id) : await markDelivered(token, order.id);
    setPendingId(null);
    if (!res.ok) setMessage(t(ERROR_KEY[res.code]));
    refresh();
  }

  if (result.kind === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="max-w-sm p-6 text-center">
          <p className="text-sm font-semibold">{t("driverLinkInactive")}</p>
        </Card>
      </div>
    );
  }

  if (result.kind === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="max-w-sm p-6 text-center">
          <p className="text-sm">{t("driverLoadFailed")}</p>
          <Button size="sm" variant="outline" onClick={refresh} className="mt-4 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> {t("driverRefresh")}
          </Button>
        </Card>
      </div>
    );
  }

  const { view } = result;

  function money(order: DriverViewOrder) {
    if (order.currency === "USD" && view.showBothCurrencies && view.lbpExchangeRate > 0) {
      return formatDualCurrency(order.total, view.lbpExchangeRate, "USD");
    }
    return formatMoney(order.total, order.currency);
  }

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{view.restaurantName}</p>
            <h1 className="truncate text-xl font-extrabold">
              {t("driverGreeting")} {view.driverName}
            </h1>
          </div>
          <Button size="sm" variant="outline" onClick={refresh} disabled={isRefreshing} className="shrink-0 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> {t("driverRefresh")}
          </Button>
        </header>

        <div className="mb-4">
          <LanguageSwitcher />
        </div>

        {message && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}

        {view.orders.length === 0 ? (
          <Card className="p-8 text-center">
            <Truck className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t("driverNoOrders")}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {view.orders.map((order) => {
              const statusKey = STATUS_KEY[order.status];
              const canPickUp = order.status === "received" || order.status === "preparing";
              return (
                <Card key={order.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-extrabold">
                        {t("driverOrder")} #{order.queueNumber}
                      </span>
                      {statusKey && <Badge variant={order.status === "out_for_delivery" ? "default" : "secondary"}>{t(statusKey)}</Badge>}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">{order.customerName}</p>
                      <Button size="sm" variant="outline" asChild className="shrink-0 gap-1.5">
                        <a href={`tel:${order.customerPhone}`}>
                          <Phone className="h-3.5 w-3.5" /> {t("driverCall")}
                        </a>
                      </Button>
                    </div>

                    {order.address && (
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="break-words">{order.address}</span>
                        </p>
                        <Button size="sm" variant="outline" asChild className="shrink-0">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("driverOpenMaps")}
                          </a>
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {order.items.map((i) => `${i.quantity}x ${i.title}`).join(", ")}
                    </p>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div>
                        <p className="text-xs text-muted-foreground">{t("driverToCollect")}</p>
                        <p className="text-base font-extrabold">{money(order)}</p>
                      </div>
                      <Button
                        onClick={() => act(order, canPickUp ? "picked_up" : "delivered")}
                        disabled={pendingId === order.id}
                        className="min-w-32"
                      >
                        {canPickUp ? t("driverPickedUp") : t("driverDelivered")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the route**

Create `app/driver/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { DriverDashboard } from "@/components/driver/driver-dashboard";
import { getDriverView } from "@/lib/driver-view";

// Always re-check the token and assignments — never serve a cached copy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deliveries — Tlabli",
  robots: { index: false, follow: false },
};

export default async function DriverPage({ params }: { params: { token: string } }) {
  const result = await getDriverView(params.token);
  return (
    <LocaleProvider availableLocales={["en", "ar", "fr"]}>
      <DriverDashboard token={params.token} result={result} />
    </LocaleProvider>
  );
}
```

- [ ] **Step 6: Add the security headers**

In `next.config.mjs`, add a `headers` function to `nextConfig` (after `images`):

```js
  // The driver page URL carries the driver's magic-link token — never leak it
  // through the Referer header (Google Maps / tel: links) or search indexing.
  async headers() {
    return [
      {
        source: "/driver/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
```

- [ ] **Step 7: Lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS. The build output lists `ƒ /driver/[token]` (dynamic).

- [ ] **Step 8: Verify in the browser**

With the dev server running and a driver link from Task 3:
1. Open `/driver/not-a-real-token`. You should get the "This link is no longer active" card.
2. Open the real link with no delivery assigned. You should get "No deliveries assigned right now."
3. Assign an order in the queue and tap Refresh. The order card appears with Call, Open in Maps, and the amount to collect.
4. Tap **Picked up**. The badge becomes "On the way" and the dashboard queue card updates live.
5. Tap **Delivered** and confirm. The order disappears.
6. Switch to العربية. The layout flips right-to-left, and the choice survives a full reload.
7. Use `read_network_requests` to confirm the page response has `Referrer-Policy: no-referrer`.
8. Resize to mobile (375px). There's no horizontal scroll.
Take a screenshot of the mobile view as proof.

- [ ] **Step 9: Commit**

```bash
git add lib/i18n/dictionaries.ts lib/driver-view.ts lib/actions/driver-page-actions.ts components/driver/driver-dashboard.tsx "app/driver/[token]/page.tsx" next.config.mjs
git commit -m "feat: add magic-link driver page with picked-up and delivered actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs + full end-to-end pass

**Files:**
- Modify: `SETUP_TODO.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the setup step**

In `SETUP_TODO.md`, section 1, after step 15 (the `13_logo_image.sql` step), add a step 16:

```markdown
16. Also paste and run `supabase/sql/15_drivers.sql` — adds driver magic
   links, driver assignment on delivery orders, and the
   `order_driver_events` log. From `/dashboard/settings` → Drivers, owners
   add each driver and send them their private link over WhatsApp (the link
   is shown once; "Reset link" issues a new one and kills the old one). Delivery
   orders in the queue then get a driver picker, and drivers mark orders
   Picked up / Delivered at `/driver/<link>` — no account or password.
   Optionally run `supabase/sql/tests/15_drivers_smoke.sql` afterwards: it
   rolls itself back and should end with "drivers smoke test: all assertions
   passed". Until the migration runs, adding a driver or assigning one shows a
   save error, but everything else keeps working.
```

(If step 16 already exists because a later migration landed first, use the next free number.)

- [ ] **Step 2: Update the README**

In `README.md`'s "What to look at" list, add after the `/order/o-1001` line:

```markdown
- `/driver/<token>` — a driver's private delivery page (magic link issued from
  Settings → Drivers); shows only orders currently assigned to that driver
```

In "Project structure", add under `components/`:

```
  driver/                  Magic-link driver page UI
```

- [ ] **Step 3: Full manual pass (spec Testing section)**

With `15_drivers.sql` applied and the dev server running, walk through the spec's Testing list, items 1–10 in `docs/superpowers/specs/2026-09-27-driver-dashboard-design.md`: add a driver, assign, picked up, reassign (stale tap → "This order was reassigned."), deliver, reset link, deactivate with an active order, check `order_driver_events` in Supabase Studio, Arabic right-to-left layout, and a pickup order with no select. Write down anything that fails and fix it before continuing.

- [ ] **Step 4: Final lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add SETUP_TODO.md README.md
git commit -m "docs: document driver dashboard setup and the /driver route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
