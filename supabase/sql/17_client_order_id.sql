-- 17_client_order_id.sql
-- Lets checkout choose the new order's id up front, so the customer's
-- WhatsApp message can include a tracking link (/order/<id>). Paste into
-- Supabase Studio's SQL Editor and run AFTER 01–16, and BEFORE deploying the
-- app code that sends p_id (the app retries without p_id if this migration
-- is missing, but those orders' tracking links would then be wrong).
--
-- Why the id has to come from the browser: the wa.me link must open
-- synchronously on the "Place order" tap (before any await), or browsers
-- block it as a popup — so the message is written before create_order runs
-- and can't wait for a database-generated id. The browser generates a random
-- UUID (crypto.randomUUID) and passes it here; a colliding or reused id just
-- fails the primary-key insert. p_id is optional and last, so older callers
-- that omit it keep working and get a database-generated id as before.
--
-- The old 10-argument signature is dropped first: keeping both overloads
-- would make PostgREST's named-argument call ambiguous.

drop function if exists create_order(uuid, text, text, text, text, text, jsonb, numeric, text, text);

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
  p_promo_code text,
  p_id uuid default null
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
    id, restaurant_id, queue_number, customer_name, customer_phone, order_type,
    table_number, address, items, total, currency, status, promo_code
  )
  values (
    coalesce(p_id, gen_random_uuid()), p_restaurant_id, v_queue_number, p_customer_name, p_customer_phone, p_order_type,
    p_table_number, p_address, p_items, p_total, p_currency, 'received', p_promo_code
  )
  returning * into new_order;

  return new_order;
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default, so revoke from them explicitly too (see 15_drivers.sql), then
-- re-grant exactly what checkout needs.
revoke execute on function create_order(uuid, text, text, text, text, text, jsonb, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function create_order(uuid, text, text, text, text, text, jsonb, numeric, text, text, uuid) to anon, authenticated;
