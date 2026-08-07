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
