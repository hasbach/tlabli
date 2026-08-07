# Supabase Schema + RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce four plain-SQL files that, once pasted into a Supabase project's Studio SQL Editor in order, create the full 9-table schema, row-level security policies, a storage bucket for menu photos, and seed data matching `lib/mock-data.ts` — with zero changes to the running Next.js app.

**Architecture:** Four ordered `.sql` files under `supabase/sql/`, each a single paste-and-run unit in Supabase Studio: schema → RLS → storage → seed. No CLI, no live database connection from this repo — delivery is copy-paste since no Supabase project exists yet (per the approved design spec).

**Tech Stack:** PostgreSQL (via Supabase). No new npm dependencies, no app code changes.

## Global Constraints

- No live Postgres/Supabase project exists yet, and this environment has no `psql` or `docker` available — no task in this plan can be verified by actually running the SQL. Verification is a manual, line-by-line consistency read-through (exact checklist per task below), not command execution.
- `restaurants.plan_id`/`restaurants.status` remain the single source of truth for a tenant's plan/status — `subscriptions` only adds `period_start`/`period_end`/`payment_proof_ref` (per the design spec).
- All tables use `id uuid primary key default gen_random_uuid()` and `created_at timestamptz not null default now()`.
- Enum-like fields use `text` + `CHECK (... IN (...))`, not Postgres `ENUM` types.
- Foreign keys use `on delete cascade` unless the spec says otherwise (`orders.driver_id` is `on delete set null`).
- This plan produces SQL files only — nothing in `app/`, `components/`, or `lib/` changes, so `npm run build` is unaffected by any task here and is not part of this plan's verification.
- One necessary addition beyond the design spec's literal RLS text: the spec's RLS section only specified public **read** access for `restaurants`/`menu_categories`/`menu_items`/`item_addons`, but enabling RLS with only a `select` policy blocks all writes to those tables for everyone — which would make the schema unusable once the (separately planned, not-yet-built) owner dashboard tries to save menu changes. Task 2 adds the staff-write policies these tables need to actually support the app; this fills a gap in the spec's enumeration rather than contradicting its intent, and is called out explicitly in Task 2 so it's not a silent addition.

---

### Task 1: Schema (`01_schema.sql`)

**Files:**
- Create: `supabase/sql/01_schema.sql`

**Interfaces:**
- Produces: 9 tables — `restaurants`, `drivers`, `menu_categories`, `menu_items`, `item_addons`, `orders`, `promo_codes`, `subscriptions`, `staff_users` — in this exact creation order (each table's foreign keys only reference tables created earlier in the same file). Task 2, 3, and 4 all depend on every table existing exactly as defined here.

- [ ] **Step 1: Create the directory and file**

Create `supabase/sql/01_schema.sql`:

```sql
-- 01_schema.sql
-- Core schema for Tlabli, matching lib/types.ts and PROJECT_INSTRUCTIONS.md
-- section 7. Paste into Supabase Studio's SQL Editor and run FIRST, before
-- 02_rls.sql / 03_storage.sql / 04_seed.sql.

create extension if not exists pgcrypto;

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  type text not null check (type in ('fast-food','bakery','fine-dining','cafe')),
  template_id text not null check (template_id in ('fast-food','bakery','fine-dining','cafe')),
  tagline text not null default '',
  logo_initial text not null default '',
  currency text not null check (currency in ('USD','LBP')) default 'USD',
  show_both_currencies boolean not null default true,
  lbp_exchange_rate numeric not null default 0,
  languages text[] not null default array['en'],
  hours jsonb not null default '[]',
  plan_id text not null check (plan_id in ('free','basic','pro','custom')) default 'free',
  status text not null check (status in ('trial','active','past_due','inactive')) default 'trial',
  whatsapp_number text not null default '',
  phone text not null default '',
  address text not null default ''
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  phone text not null
);

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category_id uuid not null references menu_categories(id) on delete cascade,
  title text not null,
  description text not null default '',
  price numeric not null,
  image_url text,
  is_available boolean not null default true,
  available_from text,
  available_until text,
  variants text[],
  is_popular boolean not null default false
);

create table item_addons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  extra_price numeric not null default 0
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  queue_number integer not null,
  customer_name text not null,
  customer_phone text not null,
  order_type text not null check (order_type in ('delivery','pickup','table')),
  table_number text,
  address text,
  items jsonb not null,
  total numeric not null,
  currency text not null check (currency in ('USD','LBP')),
  status text not null check (status in ('received','preparing','out_for_delivery','ready_for_pickup','completed','cancelled')) default 'received',
  driver_id uuid references drivers(id) on delete set null,
  promo_code text
);

create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric not null,
  active boolean not null default true,
  unique (restaurant_id, code)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  payment_proof_ref text
);

create table staff_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text not null,
  role text not null check (role in ('owner','staff')) default 'staff'
);
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm, line by line:
- Every `references X(id)` names a table that appears in an earlier `create table` statement in this same file (check: `drivers`→`restaurants` ✓, `menu_categories`→`restaurants` ✓, `menu_items`→`menu_categories` ✓, `item_addons`→`menu_items` ✓, `orders`→`restaurants` and `drivers` ✓ both defined earlier, `promo_codes`→`restaurants` ✓, `subscriptions`→`restaurants` ✓, `staff_users`→`restaurants` ✓ and `auth.users` which is a Supabase built-in, always present).
- Every table has exactly one `primary key` column (`id`).
- Every `check (... in (...))` constraint's allowed values match the corresponding TypeScript union type in `lib/types.ts` exactly (e.g. `restaurants.type` must list `'fast-food','bakery','fine-dining','cafe'` — matching `RestaurantType`).
- Parentheses and semicolons are balanced (9 `create table` statements, 9 closing `);`, plus the `create extension` line).

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/01_schema.sql
git commit -m "feat: add Supabase schema SQL (01_schema.sql)"
```

---

### Task 2: Row-level security (`02_rls.sql`)

**Files:**
- Create: `supabase/sql/02_rls.sql`

**Interfaces:**
- Consumes: the 9 tables from Task 1 (exact names and columns as defined there).
- Produces: RLS enabled on all 9 tables; a `is_staff_of(target_restaurant_id uuid) returns boolean` helper function; two additional helpers `restaurant_id_of_category(target_category_id uuid) returns uuid` and `restaurant_id_of_item(target_item_id uuid) returns uuid`. Task 3 (storage policies) calls `is_staff_of` directly. No later task calls the other two helpers, but the `menu_items`/`item_addons` write policies in this same task depend on them.

- [ ] **Step 1: Create the file**

Create `supabase/sql/02_rls.sql`:

```sql
-- 02_rls.sql
-- Enables row-level security on every table from 01_schema.sql and defines
-- the access policies. Run SECOND, after 01_schema.sql, before 03_storage.sql.

alter table restaurants enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table item_addons enable row level security;
alter table drivers enable row level security;
alter table orders enable row level security;
alter table promo_codes enable row level security;
alter table subscriptions enable row level security;
alter table staff_users enable row level security;

-- Is the current authenticated user a staff member (owner or staff) of the
-- given restaurant? SECURITY DEFINER so this bypasses staff_users' own RLS
-- when called from another table's policy — otherwise checking staff_users'
-- own policy would need to query staff_users, which is the classic RLS
-- recursion trap.
create function is_staff_of(target_restaurant_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.staff_users
    where restaurant_id = target_restaurant_id
      and auth_user_id = auth.uid()
  );
$$;

-- menu_items and item_addons have no restaurant_id column of their own —
-- these resolve it through their parent chain. Not SECURITY DEFINER: they
-- only read from menu_categories/menu_items, which already have a public
-- "select using (true)" policy below, so no RLS recursion risk exists here.
create function restaurant_id_of_category(target_category_id uuid)
returns uuid
language sql
stable
as $$
  select restaurant_id from menu_categories where id = target_category_id;
$$;

create function restaurant_id_of_item(target_item_id uuid)
returns uuid
language sql
stable
as $$
  select mc.restaurant_id
  from menu_items mi
  join menu_categories mc on mc.id = mi.category_id
  where mi.id = target_item_id;
$$;

-- Public-read tables: the storefront has no login. Staff also get full
-- write access to their own restaurant's rows (see the plan's Global
-- Constraints note on why this is here even though the design spec's RLS
-- section only spelled out the read side).
create policy "public read restaurants" on restaurants for select using (true);
create policy "staff update restaurants" on restaurants for update using (is_staff_of(id));

create policy "public read menu_categories" on menu_categories for select using (true);
create policy "staff manage menu_categories" on menu_categories for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

create policy "public read menu_items" on menu_items for select using (true);
create policy "staff manage menu_items" on menu_items for all
  using (is_staff_of(restaurant_id_of_category(category_id)))
  with check (is_staff_of(restaurant_id_of_category(category_id)));

create policy "public read item_addons" on item_addons for select using (true);
create policy "staff manage item_addons" on item_addons for all
  using (is_staff_of(restaurant_id_of_item(item_id)))
  with check (is_staff_of(restaurant_id_of_item(item_id)));

-- Staff-scoped tables: only staff of the owning restaurant, no public access.
create policy "staff manage drivers" on drivers for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));
create policy "staff manage promo_codes" on promo_codes for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));
create policy "staff manage subscriptions" on subscriptions for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));
create policy "staff manage staff_users" on staff_users for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

-- Orders: mixed. Anonymous customers can read (the order-tracking link is
-- the "auth", matching today's mock UX) and insert (checkout has no login);
-- only staff can update or delete.
create policy "anyone read orders" on orders for select using (true);
create policy "anyone insert orders" on orders for insert with check (true);
create policy "staff update orders" on orders for update using (is_staff_of(restaurant_id));
create policy "staff delete orders" on orders for delete using (is_staff_of(restaurant_id));
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm:
- All 9 `alter table ... enable row level security` lines name tables from `01_schema.sql`, and no table is missed.
- `is_staff_of`, `restaurant_id_of_category`, `restaurant_id_of_item` are each defined before any policy that calls them.
- Every policy's table name exists in `01_schema.sql`.
- `restaurants` gets read (public) + update (staff) but deliberately no insert/delete policy (creating a restaurant is the not-yet-built Auth sub-project's signup RPC; deleting a tenant isn't a feature this app has).
- `menu_categories`, `menu_items`, `item_addons`, `drivers`, `promo_codes`, `subscriptions`, `staff_users` each have a `for all` (or public-read + `for all`) policy so staff can fully manage their own restaurant's rows — cross-check this against the Global Constraints note above.
- `orders` has exactly 4 policies (select/insert/update/delete), not a `for all`, since its access pattern is intentionally mixed (anon read+insert, staff-only update+delete).

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/02_rls.sql
git commit -m "feat: add Supabase RLS policies SQL (02_rls.sql)"
```

---

### Task 3: Storage (`03_storage.sql`)

**Files:**
- Create: `supabase/sql/03_storage.sql`

**Interfaces:**
- Consumes: `is_staff_of(uuid) returns boolean` from Task 2.
- Produces: a public `menu-photos` storage bucket with read/write policies. No later task in this plan depends on this file, but the (separately planned) owner-side wiring sub-project will upload to this bucket using the `<restaurant_id>/...` path convention this task establishes.

- [ ] **Step 1: Create the file**

Create `supabase/sql/03_storage.sql`:

```sql
-- 03_storage.sql
-- Storage bucket for owner-uploaded menu item photos. Run THIRD, after
-- 02_rls.sql, before 04_seed.sql. Photos are stored under a
-- <restaurant_id>/filename path prefix so the write policy can check it.

insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true);

create policy "public read menu photos" on storage.objects
  for select using (bucket_id = 'menu-photos');

create policy "staff insert menu photos" on storage.objects
  for insert with check (
    bucket_id = 'menu-photos'
    and is_staff_of((storage.foldername(name))[1]::uuid)
  );

create policy "staff update menu photos" on storage.objects
  for update using (
    bucket_id = 'menu-photos'
    and is_staff_of((storage.foldername(name))[1]::uuid)
  );

create policy "staff delete menu photos" on storage.objects
  for delete using (
    bucket_id = 'menu-photos'
    and is_staff_of((storage.foldername(name))[1]::uuid)
  );
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm:
- The bucket id `'menu-photos'` is spelled identically in every policy's `bucket_id = 'menu-photos'` check (a typo here would silently make a policy never match).
- Every write policy (`insert`/`update`/`delete`) calls `is_staff_of(...)`, which was defined in `02_rls.sql` — this file must be run after `02_rls.sql`, not before.
- `storage.foldername(name)` is a Supabase-provided function (not something this plan defines) that splits an object path on `/` and returns an array — `[1]` is the first path segment, expected to be the restaurant's UUID as text, hence the `::uuid` cast.

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/03_storage.sql
git commit -m "feat: add Supabase storage bucket SQL (03_storage.sql)"
```

---

### Task 4: Seed data (`04_seed.sql`)

**Files:**
- Create: `supabase/sql/04_seed.sql`

**Interfaces:**
- Consumes: the 9 tables from Task 1 (RLS from Task 2 doesn't block this file — Supabase Studio's SQL Editor runs as the project's Postgres owner role, which RLS policies don't restrict).
- Produces: 4 seeded restaurants (Burger House, Sweet Crumbs Bakery, Le Jardin, Café Terra) with their categories/items/addons/driver/promo code/subscription/staff, plus 5 orders for Burger House only (mock data has no orders for the other 3 restaurants, so none are invented here). No later task in this plan consumes this data — it exists for manual verification during the separately planned owner-side and storefront wiring sub-projects.

- [ ] **Step 1: Create the file**

Create `supabase/sql/04_seed.sql`:

```sql
-- 04_seed.sql
-- Demo data matching lib/mock-data.ts, for manual verification during later
-- wiring work. Run LAST, after 01_schema.sql, 02_rls.sql, 03_storage.sql.

-- Burger House (fast food)
with r as (
  insert into restaurants (name, slug, type, template_id, tagline, logo_initial, currency, show_both_currencies, lbp_exchange_rate, languages, hours, plan_id, status, whatsapp_number, phone, address)
  values (
    'Burger House', 'burger-house', 'fast-food', 'fast-food',
    'Beirut''s favorite late-night burger stop', 'B', 'USD', true, 89500,
    array['en','ar'],
    '[
      {"day":"mon","open":"11:00","close":"23:30"},
      {"day":"tue","open":"11:00","close":"23:30"},
      {"day":"wed","open":"11:00","close":"23:30"},
      {"day":"thu","open":"11:00","close":"00:30"},
      {"day":"fri","open":"11:00","close":"01:30"},
      {"day":"sat","open":"11:00","close":"01:30"},
      {"day":"sun","open":"12:00","close":"23:00"}
    ]'::jsonb,
    'basic', 'active', '+96170123456', '+96170123456', 'Hamra Street, Beirut'
  )
  returning id
),
cat_burgers as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Burgers', 1 from r returning id
),
cat_sides as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Sides & Snacks', 2 from r returning id
),
cat_drinks as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Drinks', 3 from r returning id
),
item_classic as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Classic Smash Burger', 'Beef patty, cheddar, pickles, house sauce, brioche bun.', 6.5, true, true from cat_burgers
  returning id
),
item_double as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Double Trouble', 'Two beef patties, double cheddar, caramelized onions.', 9, true from cat_burgers
  returning id
),
item_chicken as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Crispy Chicken Burger', 'Fried chicken thigh, slaw, spicy mayo.', 7, false from cat_burgers
  returning id
),
item_fries as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Golden Fries', 'Crispy shoestring fries, house seasoning.', 3, true, true from cat_sides
  returning id
),
item_combo as (
  insert into menu_items (category_id, title, description, price, is_available, available_from, available_until)
  select id, 'Lunch Combo (12–3pm only)', 'Burger + fries + drink at a lunch-hour price.', 8, true, '12:00', '15:00' from cat_sides
  returning id
),
item_cola as (
  insert into menu_items (category_id, title, description, price, is_available, variants)
  select id, 'Soft Drink', 'Can, 330ml.', 1.5, true, array['Cola','Lemon-lime','Orange'] from cat_drinks
  returning id
),
addon_1 as (
  insert into item_addons (item_id, name, extra_price)
  select id, 'Extra cheese', 0.75 from item_classic
  returning id
),
addon_2 as (
  insert into item_addons (item_id, name, extra_price)
  select id, 'Add bacon', 1.5 from item_classic
  returning id
),
addon_3 as (
  insert into item_addons (item_id, name, extra_price)
  select id, 'Add bacon', 1.5 from item_double
  returning id
),
addon_4 as (
  insert into item_addons (item_id, name, extra_price)
  select id, 'Cheese sauce dip', 1 from item_fries
  returning id
),
drv as (
  insert into drivers (restaurant_id, name, phone)
  select id, 'Jad K.', '+96171987654' from r
  returning id
),
promo as (
  insert into promo_codes (restaurant_id, code, discount_type, discount_value, active)
  select id, 'WELCOME10', 'percent', 10, true from r
  returning id
),
sub as (
  insert into subscriptions (restaurant_id, period_start, period_end, payment_proof_ref)
  select id, '2026-07-15', '2026-08-15', 'OMT ref #48213' from r
  returning id
),
staff_owner as (
  insert into staff_users (restaurant_id, name, phone, role)
  select id, 'Rami Abou Chacra', '+96170123456', 'owner' from r
  returning id
),
staff_1 as (
  insert into staff_users (restaurant_id, name, phone, role)
  select id, 'Nadine Fares', '+96171112233', 'staff' from r
  returning id
)
insert into staff_users (restaurant_id, name, phone, role)
select id, 'Karim Haddad', '+96176334455', 'staff' from r;

-- Sweet Crumbs Bakery (bakery)
with r as (
  insert into restaurants (name, slug, type, template_id, tagline, logo_initial, currency, show_both_currencies, lbp_exchange_rate, languages, hours, plan_id, status, whatsapp_number, phone, address)
  values (
    'Sweet Crumbs Bakery', 'sweet-crumbs', 'bakery', 'bakery',
    'Fresh from our oven to your table, every morning', 'S', 'USD', true, 89500,
    array['en','ar','fr'],
    '[
      {"day":"mon","open":"07:00","close":"19:00"},
      {"day":"tue","open":"07:00","close":"19:00"},
      {"day":"wed","open":"07:00","close":"19:00"},
      {"day":"thu","open":"07:00","close":"19:00"},
      {"day":"fri","open":"07:00","close":"19:00"},
      {"day":"sat","open":"08:00","close":"20:00"},
      {"day":"sun","open":"08:00","close":"15:00"}
    ]'::jsonb,
    'free', 'trial', '+96176234567', '+96176234567', 'Jounieh Highway, Mount Lebanon'
  )
  returning id
),
cat_cakes as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Cakes', 1 from r returning id
),
cat_pastries as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Pastries', 2 from r returning id
),
cat_bread as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Fresh Bread', 3 from r returning id
),
item_choc_cake as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Chocolate Layer Cake', 'Rich Belgian chocolate, ganache, per slice.', 5, true, true from cat_cakes
  returning id
),
item_cheesecake as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'New York Cheesecake', 'Classic baked cheesecake, berry compote.', 5.5, true from cat_cakes
  returning id
),
item_croissant as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Butter Croissant', 'Laminated French-style croissant, baked fresh daily.', 2, true, true from cat_pastries
  returning id
),
item_manoushe as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Cheese Manoushe', 'Traditional Lebanese flatbread with akkawi cheese.', 3, true from cat_pastries
  returning id
),
item_bread as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Sourdough Loaf', '48-hour fermented sourdough, baked daily.', 4, false from cat_bread
  returning id
),
addon_zaatar as (
  insert into item_addons (item_id, name, extra_price)
  select id, 'Add zaatar', 0.5 from item_manoushe
  returning id
),
drv as (
  insert into drivers (restaurant_id, name, phone)
  select id, 'Mia T.', '+96176998877' from r
  returning id
),
promo as (
  insert into promo_codes (restaurant_id, code, discount_type, discount_value, active)
  select id, 'SWEET15', 'percent', 15, true from r
  returning id
),
sub as (
  insert into subscriptions (restaurant_id, period_start, period_end)
  select id, '2026-07-01', '2026-08-01' from r
  returning id
)
insert into staff_users (restaurant_id, name, phone, role)
select id, 'Sara Khalil', '+96176234567', 'owner' from r;

-- Le Jardin (fine dining)
with r as (
  insert into restaurants (name, slug, type, template_id, tagline, logo_initial, currency, show_both_currencies, lbp_exchange_rate, languages, hours, plan_id, status, whatsapp_number, phone, address)
  values (
    'Le Jardin', 'le-jardin', 'fine-dining', 'fine-dining',
    'Contemporary Lebanese fine dining', 'J', 'USD', false, 89500,
    array['en','fr'],
    '[
      {"day":"tue","open":"18:00","close":"23:30"},
      {"day":"wed","open":"18:00","close":"23:30"},
      {"day":"thu","open":"18:00","close":"23:30"},
      {"day":"fri","open":"13:00","close":"00:00"},
      {"day":"sat","open":"13:00","close":"00:00"},
      {"day":"sun","open":"13:00","close":"22:00"},
      {"day":"mon","open":"","close":"","closed":true}
    ]'::jsonb,
    'pro', 'active', '+96181345678', '+96181345678', 'Downtown, Beirut'
  )
  returning id
),
cat_starters as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Starters', 1 from r returning id
),
cat_mains as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Main Courses', 2 from r returning id
),
cat_desserts as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Desserts', 3 from r returning id
),
item_tartare as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Beef Tartare', 'Hand-cut beef, egg yolk, capers, sourdough crisp.', 16, true from cat_starters
  returning id
),
item_scallops as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Seared Scallops', 'Cauliflower purée, brown butter, chive oil.', 18, true, true from cat_starters
  returning id
),
item_steak as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Dry-Aged Sirloin', '28-day dry-aged, roasted bone marrow, red wine jus.', 34, true, true from cat_mains
  returning id
),
item_seabass as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Roasted Seabass', 'Fennel, saffron beurre blanc, confit lemon.', 29, true from cat_mains
  returning id
),
item_souffle as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Dark Chocolate Soufflé', 'Molten centre, gold leaf, vanilla anglaise.', 12, true from cat_desserts
  returning id
),
drv as (
  insert into drivers (restaurant_id, name, phone)
  select id, 'Walid S.', '+96181223344' from r
  returning id
),
promo as (
  insert into promo_codes (restaurant_id, code, discount_type, discount_value, active)
  select id, 'FIXED5', 'fixed', 5, true from r
  returning id
),
sub as (
  insert into subscriptions (restaurant_id, period_start, period_end, payment_proof_ref)
  select id, '2026-07-01', '2026-08-01', 'Whish Money ref #77410' from r
  returning id
),
staff_owner as (
  insert into staff_users (restaurant_id, name, phone, role)
  select id, 'Jean Nassar', '+96181345678', 'owner' from r
  returning id
)
insert into staff_users (restaurant_id, name, phone, role)
select id, 'Elie Matta', '+96181556677', 'staff' from r;

-- Café Terra (cafe)
with r as (
  insert into restaurants (name, slug, type, template_id, tagline, logo_initial, currency, show_both_currencies, lbp_exchange_rate, languages, hours, plan_id, status, whatsapp_number, phone, address)
  values (
    'Café Terra', 'cafe-terra', 'cafe', 'cafe',
    'Slow mornings, good coffee, warm pastries', 'T', 'USD', true, 89500,
    array['en','ar'],
    '[
      {"day":"mon","open":"08:00","close":"20:00"},
      {"day":"tue","open":"08:00","close":"20:00"},
      {"day":"wed","open":"08:00","close":"20:00"},
      {"day":"thu","open":"08:00","close":"20:00"},
      {"day":"fri","open":"08:00","close":"22:00"},
      {"day":"sat","open":"09:00","close":"22:00"},
      {"day":"sun","open":"09:00","close":"20:00"}
    ]'::jsonb,
    'basic', 'active', '+96178456789', '+96178456789', 'Gemmayze, Beirut'
  )
  returning id
),
cat_coffee as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Coffee', 1 from r returning id
),
cat_food as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Light Bites', 2 from r returning id
),
cat_pastries as (
  insert into menu_categories (restaurant_id, name, sort_order)
  select id, 'Pastries', 3 from r returning id
),
item_cappuccino as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Cappuccino', 'Double shot espresso, steamed milk, cocoa dust.', 3, true, true from cat_coffee
  returning id
),
item_latte as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Vanilla Latte', 'Espresso, house vanilla syrup, steamed milk.', 3.5, true from cat_coffee
  returning id
),
item_avocado as (
  insert into menu_items (category_id, title, description, price, is_available, is_popular)
  select id, 'Avocado Toast', 'Sourdough, smashed avocado, chili flakes, feta.', 6, true, true from cat_food
  returning id
),
item_almond as (
  insert into menu_items (category_id, title, description, price, is_available)
  select id, 'Almond Croissant', 'Filled and topped with almond cream, sliced almonds.', 2.75, true from cat_pastries
  returning id
),
addon_oat1 as (
  insert into item_addons (item_id, name, extra_price)
  select id, 'Oat milk', 0.5 from item_cappuccino
  returning id
),
addon_oat2 as (
  insert into item_addons (item_id, name, extra_price)
  select id, 'Oat milk', 0.5 from item_latte
  returning id
),
drv as (
  insert into drivers (restaurant_id, name, phone)
  select id, 'Zeina H.', '+96178334455' from r
  returning id
),
promo as (
  insert into promo_codes (restaurant_id, code, discount_type, discount_value, active)
  select id, 'MORNING10', 'percent', 10, true from r
  returning id
),
sub as (
  insert into subscriptions (restaurant_id, period_start, period_end)
  select id, '2026-07-20', '2026-08-20' from r
  returning id
)
insert into staff_users (restaurant_id, name, phone, role)
select id, 'Tarek Younes', '+96178456789', 'owner' from r;

-- Orders for Burger House only — lib/mock-data.ts has no orders seeded for
-- the other 3 restaurants, so none are invented here.
with bh as (
  select id from restaurants where slug = 'burger-house'
),
drv as (
  select id from drivers where restaurant_id = (select id from bh) and name = 'Jad K.'
)
insert into orders (restaurant_id, queue_number, customer_name, customer_phone, order_type, address, table_number, items, total, currency, status, driver_id, created_at)
values
(
  (select id from bh), 12, 'Nour A.', '+96170111222', 'delivery', 'Verdun, Beirut', null,
  jsonb_build_array(
    jsonb_build_object('itemId', (select id from menu_items where title = 'Classic Smash Burger'), 'title', 'Classic Smash Burger', 'quantity', 2, 'unitPrice', 6.5, 'addons', jsonb_build_array('Extra cheese')),
    jsonb_build_object('itemId', (select id from menu_items where title = 'Golden Fries'), 'title', 'Golden Fries', 'quantity', 1, 'unitPrice', 3, 'addons', '[]'::jsonb)
  ),
  16.75, 'USD', 'preparing', (select id from drv), '2026-08-06T11:42:00+03:00'
),
(
  (select id from bh), 13, 'Karim H.', '+96170333444', 'pickup', null, null,
  jsonb_build_array(
    jsonb_build_object('itemId', (select id from menu_items where title = 'Double Trouble'), 'title', 'Double Trouble', 'quantity', 1, 'unitPrice', 9, 'addons', '[]'::jsonb),
    jsonb_build_object('itemId', (select id from menu_items where title = 'Soft Drink'), 'title', 'Soft Drink', 'quantity', 1, 'unitPrice', 1.5, 'addons', jsonb_build_array('Cola'))
  ),
  10.5, 'USD', 'received', null, '2026-08-06T11:47:00+03:00'
),
(
  (select id from bh), 14, 'Lea S.', '+96170555666', 'table', null, '5',
  jsonb_build_array(
    jsonb_build_object('itemId', (select id from menu_items where title = 'Lunch Combo (12–3pm only)'), 'title', 'Lunch Combo (12–3pm only)', 'quantity', 1, 'unitPrice', 8, 'addons', '[]'::jsonb)
  ),
  8, 'USD', 'ready_for_pickup', null, '2026-08-06T12:05:00+03:00'
),
(
  (select id from bh), 15, 'Elie R.', '+96170777888', 'delivery', 'Achrafieh, Beirut', null,
  jsonb_build_array(
    jsonb_build_object('itemId', (select id from menu_items where title = 'Classic Smash Burger'), 'title', 'Classic Smash Burger', 'quantity', 1, 'unitPrice', 6.5, 'addons', '[]'::jsonb)
  ),
  6.5, 'USD', 'out_for_delivery', (select id from drv), '2026-08-06T12:10:00+03:00'
),
(
  (select id from bh), 11, 'Maya D.', '+96170999000', 'pickup', null, null,
  jsonb_build_array(
    jsonb_build_object('itemId', (select id from menu_items where title = 'Golden Fries'), 'title', 'Golden Fries', 'quantity', 2, 'unitPrice', 3, 'addons', '[]'::jsonb)
  ),
  6, 'USD', 'completed', null, '2026-08-06T11:20:00+03:00'
);
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm:
- Each of the 4 restaurant blocks follows the same shape: one `with r as (insert into restaurants ... returning id)`, then categories referencing `r`, then items referencing the correct category CTE, then addons referencing the correct item CTE, then driver/promo/subscription/staff referencing `r` — and the block's final statement is a plain `insert ... select ... from r` (not itself wrapped in another `with`), which is what makes the whole chain execute as one statement per restaurant.
- Every `select id, ... from cat_X` / `from item_X` in an addon or item insert references a CTE name defined earlier in the *same* restaurant's block (CTE names are not shared across blocks — each restaurant's block starts a fresh `with`).
- Category/item/addon counts per restaurant match `lib/mock-data.ts` exactly: Burger House (3 categories, 6 items, 4 addons), Sweet Crumbs (3 categories, 5 items, 1 addon), Le Jardin (3 categories, 5 items, 0 addons), Café Terra (3 categories, 4 items, 2 addons).
- The final `orders` block comes after all 4 restaurant blocks (so `menu_items`/`drivers` rows it looks up by title/name already exist), and its 5 rows match `lib/mock-data.ts`'s `orders` array exactly (same customer names, quantities, totals, statuses, `queue_number` values 12/13/14/15/11).
- Every `(select id from menu_items where title = '...')` string matches a `title` value inserted earlier in one of the 4 restaurant blocks, character for character (these titles are unique across the whole seed set, so an unscoped lookup by title is safe here — but only because of that uniqueness).

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/04_seed.sql
git commit -m "feat: add Supabase seed data SQL (04_seed.sql)"
```

---

### Task 5: Update `SETUP_TODO.md` and final cross-file check

**Files:**
- Modify: `SETUP_TODO.md` (item 1, currently lines 9-24)

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Rewrite `SETUP_TODO.md` item 1**

The section currently reads:

```md
## 1. Create the Supabase project (required to go live)

1. Create a free project at supabase.com.
2. In the SQL editor, create tables matching `lib/types.ts` — the shapes there
   mirror `PROJECT_INSTRUCTIONS.md` section 7 exactly: `restaurants`,
   `menu_categories`, `menu_items`, `item_addons`, `orders`, `drivers`,
   `promo_codes`, `subscriptions`, `staff_users`.
3. Enable Row-Level Security on every table so each restaurant only reads/writes
   its own rows.
4. Create a Storage bucket (e.g. `menu-photos`) for owner-uploaded item photos.
5. Copy the project URL and anon key into `.env.local` (see `.env.example`).
6. Run `npm install @supabase/supabase-js` and uncomment the client in
   `lib/supabase/client.ts`.
7. Swap the mock reads in `lib/mock-data.ts` / `lib/menu.ts` for real Supabase
   queries — every place that needs this is marked with a
   `// TODO(supabase):` comment.
```

Replace it with:

```md
## 1. Create the Supabase project (required to go live)

1. Create a free project at supabase.com.
2. Open the SQL Editor and run these four files, in order, pasting each
   one's full contents and clicking Run before moving to the next:
   `supabase/sql/01_schema.sql`, `supabase/sql/02_rls.sql`,
   `supabase/sql/03_storage.sql`, `supabase/sql/04_seed.sql`. Together they
   create all 9 tables (matching `lib/types.ts` / `PROJECT_INSTRUCTIONS.md`
   section 7), enable Row-Level Security with the right policies, create the
   `menu-photos` storage bucket, and seed the same 4 demo restaurants
   `lib/mock-data.ts` already shows — so you can confirm the real database
   looks right before anything in the app depends on it.
3. Copy the project URL and anon key into `.env.local` (see `.env.example`).
4. Run `npm install @supabase/supabase-js` and uncomment the client in
   `lib/supabase/client.ts`.
5. Swap the mock reads in `lib/mock-data.ts` / `lib/menu.ts` for real Supabase
   queries — every place that needs this is marked with a
   `// TODO(supabase):` comment. (This is its own separate piece of work —
   see the project's other in-progress specs for auth and data-wiring.)
```

- [ ] **Step 2: Final cross-file consistency check**

Read all four `supabase/sql/*.sql` files together in numeric order and confirm:
- `02_rls.sql` never references a table or column not created in `01_schema.sql`.
- `03_storage.sql`'s `is_staff_of` call matches the function signature defined in `02_rls.sql` exactly (one `uuid` argument).
- `04_seed.sql` never references a table not created in `01_schema.sql`, and every column list in its `insert into X (...)` statements matches a real column from that table in `01_schema.sql` (e.g. `orders`' insert lists `restaurant_id, queue_number, customer_name, customer_phone, order_type, address, table_number, items, total, currency, status, driver_id, created_at` — every one of those must appear in `01_schema.sql`'s `orders` table definition).
- No file other than `04_seed.sql` inserts rows — Tasks 1-3 only create structure.

- [ ] **Step 3: Commit**

```bash
git add SETUP_TODO.md
git commit -m "docs: point SETUP_TODO.md at the new supabase/sql files"
```

## Self-Review Notes

- **Spec coverage:** Task 1 covers the spec's Tables section (all 9, FK-safe order: `restaurants` → `drivers` → `menu_categories` → `menu_items` → `item_addons` → `orders` → `promo_codes` → `subscriptions` → `staff_users`, reordered from the spec's prose order so every FK target exists before it's referenced). Task 2 covers the RLS section, extended with the staff-write policies the spec's RLS prose didn't spell out (flagged in Global Constraints). Task 3 covers Storage. Task 4 covers Seed data, including the explicit note that promo codes/drivers per non-Burger-House restaurant have no mock-data equivalent to copy — one plausible code/driver was invented per restaurant, matching the spec's literal "one driver, one promo code... each" text. Task 5 covers Delivery (the `SETUP_TODO.md` rewrite).
- **Placeholder scan:** no TBD/TODO markers; every step has complete, literal SQL or Markdown text.
- **Type consistency:** `is_staff_of(target_restaurant_id uuid)` is defined once in Task 2 and called with that same one-argument signature in every later policy in Task 2 and in Task 3's storage policies. Table/column names are consistent across all 4 files (verified by the Task 5 cross-file check).
