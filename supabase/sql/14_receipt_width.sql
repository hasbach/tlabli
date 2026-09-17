-- 14_receipt_width.sql
-- Adds a per-restaurant receipt paper width. print-ticket.tsx used to
-- hardcode every ticket to 80mm, which is common but not universal — plenty
-- of small counters run a 58mm thermal printer, and on those the 80mm CSS
-- ticket either gets clipped at the print head's usable width or scaled
-- down by the driver, neither of which matches "the actual receipt size."
-- Paste into Supabase Studio's SQL Editor and run AFTER 01_schema.sql
-- through 13_logo_image.sql are already applied.

alter table restaurants
  add column if not exists receipt_width_mm smallint not null default 80;

alter table restaurants
  add constraint receipt_width_mm_valid check (receipt_width_mm in (58, 80));
