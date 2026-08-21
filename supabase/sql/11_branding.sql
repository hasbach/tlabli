-- 11_branding.sql
-- Per-restaurant color palette and header image customization. Paste into
-- Supabase Studio's SQL Editor and run AFTER 01_schema.sql through
-- 10_menu_translations.sql are already applied.
--
-- brand_palette is 'template-default' (use the hardcoded .theme-* colors
-- for this restaurant's template, today's only behavior), one of the
-- curated preset ids defined in lib/branding.ts, or 'custom' (use
-- brand_primary_color/brand_secondary_color instead). No RLS change is
-- needed: the existing "staff update restaurants"/"public read
-- restaurants" policies (02_rls.sql) already cover any column on this row,
-- and the storefront (anonymous) needs public read access to render the
-- chosen branding.

alter table restaurants
  add column brand_palette text not null default 'template-default',
  add column brand_primary_color text,
  add column brand_secondary_color text,
  add column header_image_url text;
