-- 09_printer_settings.sql
-- Adds three independent printer-role toggles to restaurants. Paste into
-- Supabase Studio's SQL Editor and run AFTER 01_schema.sql through
-- 08_whatsapp.sql are already applied.
--
-- No new table and no RLS change needed: the existing "staff update
-- restaurants" policy (for update using (is_staff_of(id)), 02_rls.sql)
-- already covers any column on the restaurant's own row, and "public read
-- restaurants" already exposes these columns read-side — harmless, they're
-- just booleans describing what the restaurant prints on, not sensitive.
--
-- POS and Kitchen default to true (every restaurant needs a receipt for the
-- customer/driver and a kitchen prep ticket); Bar defaults to false since
-- most small restaurants don't have a separate bar station.

alter table restaurants
  add column pos_printer_enabled boolean not null default true,
  add column kitchen_printer_enabled boolean not null default true,
  add column bar_printer_enabled boolean not null default false;
