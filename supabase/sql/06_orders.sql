-- 06_orders.sql
-- Adds real order creation with a race-free per-restaurant queue number.
-- Paste into Supabase Studio's SQL Editor and run AFTER 01_schema.sql,
-- 02_rls.sql, 03_storage.sql, 04_seed.sql, and 05_auth.sql are already applied.
--
-- Queue numbers must be unique and increasing per restaurant even when two
-- customers check out at nearly the same instant. `SELECT MAX(queue_number)+1`
-- is racy (two concurrent calls can read the same max before either inserts).
-- Instead, restaurants gets its own atomic counter column: a single
-- `UPDATE ... RETURNING` takes a row lock on that restaurant for the
-- duration of the transaction, so concurrent callers are serialized safely.

alter table restaurants add column next_queue_number integer not null default 1;

-- restaurants' own RLS ("staff update restaurants") would block an anonymous
-- checkout from incrementing next_queue_number — SECURITY DEFINER is this
-- function's one deliberate, narrow bypass, same pattern as
-- create_restaurant_with_owner in 05_auth.sql. orders' own RLS already
-- allows anonymous insert ("anyone insert orders" in 02_rls.sql), so no
-- bypass is needed for the insert itself.
create or replace function create_order(
  p_restaurant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_order_type text,
  p_table_number text,
  p_address text,
  p_items jsonb,
  p_total numeric,
  p_currency text,
  p_promo_code text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue_number integer;
  new_order public.orders;
begin
  if p_restaurant_id is null then
    raise exception 'restaurant_id is required';
  end if;

  update public.restaurants
  set next_queue_number = next_queue_number + 1
  where id = p_restaurant_id
  returning next_queue_number - 1 into v_queue_number;

  if v_queue_number is null then
    raise exception 'restaurant not found';
  end if;

  insert into public.orders (
    restaurant_id, queue_number, customer_name, customer_phone, order_type,
    table_number, address, items, total, currency, status, promo_code
  )
  values (
    p_restaurant_id, v_queue_number, p_customer_name, p_customer_phone, p_order_type,
    p_table_number, p_address, p_items, p_total, p_currency, 'received', p_promo_code
  )
  returning * into new_order;

  return new_order;
end;
$$;

revoke execute on function create_order(uuid, text, text, text, text, text, jsonb, numeric, text, text) from public;
grant execute on function create_order(uuid, text, text, text, text, text, jsonb, numeric, text, text) to anon, authenticated;
