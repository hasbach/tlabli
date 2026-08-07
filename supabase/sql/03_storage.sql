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
