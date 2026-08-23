-- 13_logo_image.sql
-- Optional owner-uploaded logo, shown in the circular badge in the
-- storefront header (replacing the letter-monogram fallback). Paste into
-- Supabase Studio's SQL Editor and run AFTER 01_schema.sql through
-- 12_temporarily_closed.sql are already applied.
--
-- Reuses the same "menu-photos" Storage bucket and RLS policies
-- (03_storage.sql) already used for menu item photos and the header
-- background image — no new bucket or policy needed. No RLS change on
-- restaurants either: the existing "staff update"/"public read" policies
-- (02_rls.sql) already cover any column on this row.

alter table restaurants
  add column logo_image_url text;
