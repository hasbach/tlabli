-- 08_whatsapp.sql
-- WhatsApp Cloud API notification settings + usage log. Paste into Supabase
-- Studio's SQL Editor and run AFTER 01_schema.sql through 07_admin.sql are
-- already applied.
--
-- Unlike restaurants/menu_*, whatsapp_settings can hold a real Meta access
-- token (own_access_token) — it must never be anonymously readable, even
-- though checkout (anonymous) needs to consult it to decide which
-- credentials to send with. There is no RLS policy that can safely express
-- "let anonymous checkout read this, but not anyone else with the public
-- anon key" — the distinction is about caller intent, which RLS can't see.
-- So this table has NO anonymous select policy at all; checkout reads it
-- via the service-role client instead (see lib/whatsapp-cloud-api.ts) — the
-- same reasoning that put staff-account creation (05_auth.sql/
-- addStaffMember) behind the service-role client.

create table whatsapp_settings (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('tlabli','own')) default 'tlabli',
  own_access_token text,
  own_phone_number_id text
);

alter table whatsapp_settings enable row level security;
create policy "staff manage whatsapp_settings" on whatsapp_settings for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

-- One row per Cloud API send attempt, not just successes — status
-- distinguishes "we didn't try" (skipped_*) from "we tried and Meta
-- rejected it" (failed), and only 'sent' rows count toward a restaurant's
-- monthly cap. No secret data lives here, so — unlike whatsapp_settings —
-- an anonymous insert policy is safe: checkout is anonymous, same as
-- "anyone insert orders" in 02_rls.sql.
create table whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null check (status in ('sent','failed','skipped_over_cap','skipped_not_configured')),
  error_message text
);

create index on whatsapp_message_log (restaurant_id, created_at);

alter table whatsapp_message_log enable row level security;
create policy "staff read whatsapp_message_log" on whatsapp_message_log for select
  using (is_staff_of(restaurant_id));
create policy "platform admin read whatsapp_message_log" on whatsapp_message_log for select
  using (is_platform_admin());
create policy "anyone insert whatsapp_message_log" on whatsapp_message_log for insert with check (true);
