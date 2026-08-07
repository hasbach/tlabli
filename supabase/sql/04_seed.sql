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
