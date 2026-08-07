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
