-- 12_temporarily_closed.sql
-- Manual "temporarily closed" override for the storefront's Open/Closed
-- badge — for holidays, emergencies, or any day the weekly schedule
-- shouldn't be trusted. Paste into Supabase Studio's SQL Editor and run
-- AFTER 01_schema.sql through 11_branding.sql are already applied.
--
-- No RLS change needed: the existing "staff update restaurants"/"public
-- read restaurants" policies (02_rls.sql) already cover any column on this
-- row, and the storefront (anonymous) needs public read to show the badge.

alter table restaurants
  add column temporarily_closed boolean not null default false;
