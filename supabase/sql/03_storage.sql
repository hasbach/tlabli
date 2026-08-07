-- 03_storage.sql
-- Storage bucket for owner-uploaded menu item photos. Run THIRD, after
-- 02_rls.sql, before 04_seed.sql. Photos are stored under a
-- <restaurant_id>/filename path prefix so the write policy can check it.

insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true);

-- Fails closed (false) instead of erroring when the object's path doesn't
-- start with a valid UUID segment — a hard error here would surface as a
-- 500 to the uploader, and since storage policies are evaluated table-wide
-- (not scoped per-bucket by Postgres), this also protects uploads to any
-- other bucket the project later adds.
create function is_staff_of_path(object_name text)
returns boolean
language plpgsql
stable
as $$
declare
  restaurant_uuid uuid;
begin
  begin
    restaurant_uuid := (storage.foldername(object_name))[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return is_staff_of(restaurant_uuid);
end;
$$;

create policy "public read menu photos" on storage.objects
  for select using (bucket_id = 'menu-photos');

create policy "staff insert menu photos" on storage.objects
  for insert with check (
    bucket_id = 'menu-photos'
    and is_staff_of_path(name)
  );

create policy "staff update menu photos" on storage.objects
  for update using (
    bucket_id = 'menu-photos'
    and is_staff_of_path(name)
  );

create policy "staff delete menu photos" on storage.objects
  for delete using (
    bucket_id = 'menu-photos'
    and is_staff_of_path(name)
  );
