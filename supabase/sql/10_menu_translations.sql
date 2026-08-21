-- 10_menu_translations.sql
-- Optional Arabic/French translations for owner-entered menu content. Paste
-- into Supabase Studio's SQL Editor and run AFTER 01_schema.sql through
-- 09_printer_settings.sql are already applied.
--
-- All new columns are nullable text with no default — a NULL/empty value
-- means "no translation entered," and the storefront falls back to the
-- base (owner's default-language) text for that locale. No RLS change is
-- needed: the existing "staff manage menu_categories/menu_items/item_addons"
-- and "anyone read ..." policies (02_rls.sql) already cover any column on
-- these rows.

alter table menu_categories
  add column name_ar text,
  add column name_fr text;

alter table menu_items
  add column title_ar text,
  add column description_ar text,
  add column title_fr text,
  add column description_fr text;

alter table item_addons
  add column name_ar text,
  add column name_fr text;
