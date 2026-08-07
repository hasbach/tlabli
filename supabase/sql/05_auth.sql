-- 05_auth.sql
-- Bootstrap RPC for new-owner signup. Paste into Supabase Studio's SQL
-- Editor and run AFTER 01_schema.sql, 02_rls.sql, 03_storage.sql, and
-- 04_seed.sql are already applied.
--
-- restaurants has no INSERT policy (02_rls.sql), and staff_users' write
-- policy requires is_staff_of(restaurant_id) to already be true — circular
-- for a brand-new restaurant's very first staff row. This function is the
-- one deliberate, narrow bypass: it creates both rows for the calling
-- (already-authenticated) user in one transaction.

create or replace function create_restaurant_with_owner(
  p_name text,
  p_slug text,
  p_type text,
  p_whatsapp_number text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_restaurant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_slug is null or p_slug = '' then
    raise exception 'slug must not be empty';
  end if;

  insert into public.restaurants (name, slug, type, template_id, whatsapp_number, phone)
  values (p_name, p_slug, p_type, p_type, p_whatsapp_number, p_whatsapp_number)
  returning id into new_restaurant_id;

  insert into public.staff_users (restaurant_id, auth_user_id, name, phone, role)
  values (new_restaurant_id, auth.uid(), p_name, p_whatsapp_number, 'owner');

  return new_restaurant_id;
end;
$$;

revoke execute on function create_restaurant_with_owner(text, text, text, text) from public;
grant execute on function create_restaurant_with_owner(text, text, text, text) to authenticated;
