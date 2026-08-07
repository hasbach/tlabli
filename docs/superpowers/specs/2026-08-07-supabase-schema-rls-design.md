# Supabase Schema + RLS — Design

Date: 2026-08-07
Status: Approved

## Context

"Set up Supabase and wire it in" is bigger than one spec — it spans schema/RLS,
authentication, owner-side data wiring (dashboard, admin panel, team roles),
and customer-side data wiring (public storefront, checkout). This spec covers
only the first of those four, in the agreed build order:

**Schema + RLS → Auth → Owner-side wiring → Storefront wiring**

The user is starting from zero: no Supabase project exists yet. Per the
assistant's operating constraints, creating the actual Supabase account/project
is not something this session can do — that requires the user's own signup at
supabase.com. This spec's deliverable is therefore SQL the user pastes into
Supabase Studio's SQL Editor after creating their project, not a live database.

Nothing in the running Next.js app changes as part of this spec — `lib/mock-data.ts`
keeps serving the UI exactly as today. This spec only produces the SQL that
will exist independently of the app until the "owner-side wiring" and
"storefront wiring" sub-projects later swap `lib/mock-data.ts` reads for real
queries against these tables (each of those `// TODO(supabase):` sites already
exists in the code).

## Scope boundary (explicit, not solved by this spec)

Supabase's built-in `auth.users` table always exists, even with zero signup UI
built — so `staff_users.auth_user_id` can reference it now. What this spec
does **not** solve: how a brand-new signup becomes the first `staff_users`
"owner" row for a brand-new `restaurants` row. That bootstrap (a signup RPC
creating both in one transaction) belongs to the Auth sub-project. This spec's
RLS policies are written assuming that bootstrap will exist, but no such RPC
is created here.

## Tables

All tables: `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz not null default now()`. Foreign keys `on delete cascade`
unless noted. Enum-like fields use a `text` column with a `CHECK (... IN (...))`
constraint rather than a Postgres `ENUM` type, to keep future value additions a
plain constraint edit instead of a type migration.

### `restaurants`
- `name text not null`
- `slug text not null unique`
- `type text not null check (type in ('fast-food','bakery','fine-dining','cafe'))`
- `template_id text not null check (template_id in ('fast-food','bakery','fine-dining','cafe'))`
- `tagline text not null default ''`
- `logo_initial text not null default ''`
- `currency text not null check (currency in ('USD','LBP')) default 'USD'`
- `show_both_currencies boolean not null default true`
- `lbp_exchange_rate numeric not null default 0`
- `languages text[] not null default array['en']`
- `hours jsonb not null default '[]'` — array of `{day, open, close, closed?}`, matching `BusinessHours[]`
- `plan_id text not null check (plan_id in ('free','basic','pro','custom')) default 'free'`
- `status text not null check (status in ('trial','active','past_due','inactive')) default 'trial'`
- `whatsapp_number text not null default ''`
- `phone text not null default ''`
- `address text not null default ''`

### `menu_categories`
- `restaurant_id uuid not null references restaurants(id)`
- `name text not null`
- `sort_order integer not null default 0`

### `menu_items`
- `category_id uuid not null references menu_categories(id)`
- `title text not null`
- `description text not null default ''`
- `price numeric not null`
- `image_url text`
- `is_available boolean not null default true`
- `available_from text` — `"HH:MM"`, nullable
- `available_until text`
- `variants text[]`
- `is_popular boolean not null default false`

### `item_addons`
- `item_id uuid not null references menu_items(id)`
- `name text not null`
- `extra_price numeric not null default 0`

### `drivers`
- `restaurant_id uuid not null references restaurants(id)`
- `name text not null`
- `phone text not null`

### `orders`
- `restaurant_id uuid not null references restaurants(id)`
- `queue_number integer not null`
- `customer_name text not null`
- `customer_phone text not null`
- `order_type text not null check (order_type in ('delivery','pickup','table'))`
- `table_number text`
- `address text`
- `items jsonb not null` — array of `{itemId, title, quantity, unitPrice, addons}`, matching `OrderLineItem[]` (denormalized, per `PROJECT_INSTRUCTIONS.md` §7's `items_json`, not a separate line-items table)
- `total numeric not null`
- `currency text not null check (currency in ('USD','LBP'))`
- `status text not null check (status in ('received','preparing','out_for_delivery','ready_for_pickup','completed','cancelled')) default 'received'`
- `driver_id uuid references drivers(id)` (nullable, `on delete set null`)
- `promo_code text`

`queue_number` has no default — it's a plain `not null integer` and whoever
inserts an order (the storefront-checkout wiring, a later sub-project) is
responsible for computing the next value, the same way `lib/mock-data.ts`
does today. Not solved here; noted so it isn't mistaken for an oversight.

### `promo_codes`
- `restaurant_id uuid not null references restaurants(id)`
- `code text not null`
- `discount_type text not null check (discount_type in ('percent','fixed'))`
- `discount_value numeric not null`
- `active boolean not null default true`
- unique constraint on `(restaurant_id, code)`

### `subscriptions`
- `restaurant_id uuid not null references restaurants(id)`
- `period_start date not null`
- `period_end date not null`
- `payment_proof_ref text`

`restaurants.plan_id`/`restaurants.status` remain the single source of truth
for current plan/status (matching the mock-data-era decision already made for
the admin panel) — `subscriptions` only carries the billing-period metadata
not already on `restaurants`.

### `staff_users`
- `restaurant_id uuid not null references restaurants(id)`
- `auth_user_id uuid references auth.users(id)` — nullable for now (no signup flow yet to populate it; becomes required in practice once Auth sub-project ships)
- `name text not null`
- `phone text not null`
- `role text not null check (role in ('owner','staff')) default 'staff'`

No `analytics` table: `AnalyticsSnapshot` stays a computed aggregate — later
wiring queries `orders` directly (or a SQL view) rather than maintaining a
duplicated stored snapshot. Not part of this spec's 9 tables.

## RLS

Enabled on every table. Three access patterns:

**1. Public-read tables** — `restaurants`, `menu_categories`, `menu_items`, `item_addons`:
```sql
create policy "public read" on restaurants for select using (true);
-- same shape for menu_categories, menu_items, item_addons
```
The storefront has no login, so anonymous `SELECT` is unconditional.

**2. Staff-scoped tables** — `drivers`, `promo_codes`, `subscriptions`, `staff_users`:
A `SECURITY DEFINER` helper function avoids the recursive-RLS problem where
`staff_users`' own policy would otherwise need to query `staff_users` under
RLS:
```sql
create function is_staff_of(target_restaurant_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from staff_users
    where restaurant_id = target_restaurant_id
      and auth_user_id = auth.uid()
  );
$$;
```
Every staff-scoped table gets `for all using (is_staff_of(restaurant_id))`.

**3. `orders`** — mixed:
- `select using (true)` — anonymous read allowed; the order-tracking link
  itself is the "auth" today (matches current mock UX exactly, no accounts).
- `insert` — anonymous allowed (checkout has no login), but only inserting
  columns the customer legitimately supplies. `queue_number` and `status`
  default server-side; the insert policy doesn't restrict column values
  (Postgres RLS can't do column-level checks), so the actual guard is that
  the app's insert always send `status: 'received'` — a real hardening step
  (a trigger forcing `status = 'received'` and `queue_number` to a computed
  next value on insert) is left as a follow-up, not built in this pass since
  no attacker-facing endpoint exists yet.
- `update` — `using (is_staff_of(restaurant_id))` only. Anonymous customers
  can never change order status.

## Storage

One bucket: `menu-photos`.
```sql
insert into storage.buckets (id, name, public) values ('menu-photos', 'menu-photos', true);

create policy "public read menu photos" on storage.objects
  for select using (bucket_id = 'menu-photos');

create policy "staff write menu photos" on storage.objects
  for insert with check (
    bucket_id = 'menu-photos'
    and is_staff_of((storage.foldername(name))[1]::uuid)
  );
```
Photos are stored under a `<restaurant_id>/...` path prefix; the write policy
checks that prefix against `is_staff_of`. Public read is unconditional since
menu photos must load on the public storefront. `update`/`delete` policies
mirror the `insert` policy.

## Seed data

`04_seed.sql` inserts the same 4 demo restaurants as `lib/mock-data.ts`
(Burger House, Sweet Crumbs Bakery, Le Jardin, Café Terra) with the same
names, taglines, hours, categories, menu items, addons, one driver, one promo
code, one subscription row and one owner `staff_users` row each, and a
handful of orders per restaurant matching the mock data's variety (different
statuses, order types). IDs are fresh UUIDs (not the old `r-fastfood`-style
strings) — the seed script uses SQL `with` CTEs so inserted UUIDs can be
referenced across statements without hardcoding literals, e.g.:

```sql
with r as (
  insert into restaurants (name, slug, type, template_id, ...)
  values ('Burger House', 'burger-house', 'fast-food', 'fast-food', ...)
  returning id
)
insert into menu_categories (restaurant_id, name, sort_order)
select id, 'Burgers', 1 from r;
```

`staff_users.auth_user_id` is left `null` for all seeded rows (no real users
exist yet) — seeded staff rows exist so the Team section has something to
display once wired, but they aren't tied to a real login until the Auth
sub-project creates one.

## Delivery

Four files under `supabase/sql/`, run in Studio's SQL Editor in order:

- `01_schema.sql` — the 9 `create table` statements above
- `02_rls.sql` — `alter table ... enable row level security`, the `is_staff_of` function, and every policy
- `03_storage.sql` — the bucket + storage policies
- `04_seed.sql` — demo data

`SETUP_TODO.md` item 1 gets rewritten to reference these four files by name
instead of "create tables matching `lib/types.ts` freehand," and to note that
schema/RLS is now scripted while auth/wiring remain separate later steps.

## Testing / verification

No test framework in this repo, and this spec produces SQL files, not
application code — `npm run build` is unaffected (nothing in `app/`/`components/`/`lib/`
changes). Verification is: the user creates a Supabase project, pastes the
four files into the SQL Editor in order, and confirms in Studio's Table
Editor that all 9 tables exist with the seeded rows, and that the `menu-photos`
bucket exists. That confirmation happens in a later session once the user has
actually created the project — this spec's own self-review can only confirm
the SQL is internally consistent (every FK target table is defined before use
in file order, every policy references a table/column defined in `01_schema.sql`).

## Known limitations, deferred to later sub-projects

Found during the final whole-branch review, confirmed with the user, and
deliberately left unfixed here because each depends on decisions the later
sub-projects still need to make:

1. **No platform-admin RLS bypass.** Every policy in `02_rls.sql` scopes
   access to `is_staff_of(restaurant_id)` — there is no cross-tenant read or
   write path. The already-built `/admin` panel (`app/admin/page.tsx`) needs
   exactly that. Owned by the **Auth** sub-project, since "what makes someone
   a platform admin" is an identity question that sub-project has to answer
   anyway.
2. **Tenants can write their own billing state.** `restaurants`' staff-update
   policy and `subscriptions`' staff-`for all` policy let a tenant
   self-upgrade `plan_id`, flip `status` to `active`, or insert a fabricated
   `payment_proof_ref` — the inverse of item 1. Owned by the **owner-side
   wiring** sub-project, which should revoke tenant write access to
   `restaurants.plan_id`/`status` and reduce `subscriptions` to staff-read-only
   once the admin panel is the sole writer of billing state.
3. **`drivers` has no public-read policy**, but the already-built customer
   order-tracking page (`app/order/[orderId]/page.tsx`) displays driver
   name/phone with no login. Fails closed today (the card just won't render
   once wired) rather than leaking anything — but it needs a fix before that
   page can show real data.
4. **`orders` is fully anon-readable** (`for select using (true)`) — this was
   an explicit, approved choice in this spec's original RLS section ("the
   order-tracking link is the auth"), but a table-wide policy can't express
   "only if you already know the id": anyone holding the public anon key can
   read every customer's name/phone/address across every restaurant, not
   just the one order they're tracking.

Items 3 and 4 share one fix, recommended by the review and agreed with the
user: replace the blanket `orders`/`drivers` anon-read policies with a single
`SECURITY DEFINER` RPC that takes an order id and returns that order joined
to its driver — the id becomes the actual capability, not a wide-open table
policy. Design this alongside the **storefront-wiring** sub-project, once
that sub-project knows exactly how the order-tracking page will call it.
