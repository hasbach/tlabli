-- 07_admin.sql
-- Cross-tenant read/write access for the platform admin panel (/admin).
-- Paste into Supabase Studio's SQL Editor and run AFTER 01_schema.sql,
-- 02_rls.sql, 03_storage.sql, 04_seed.sql, 05_auth.sql, and 06_orders.sql
-- are already applied.
--
-- Every existing policy in 02_rls.sql scopes access to is_staff_of(), with no
-- cross-tenant path — by design, per 02_rls.sql's header comment deferring
-- this to a later sub-project. This file adds that path for exactly the two
-- tables /admin reads or writes (restaurants, subscriptions), not a blanket
-- cross-tenant bypass — see
-- docs/superpowers/specs/2026-08-17-admin-data-wiring-design.md for the full
-- rationale, including why this is RLS policies + a table rather than a
-- service-role client or admin-only RPCs.
--
-- PLATFORM_ADMIN_EMAILS (middleware.ts) is a Next.js env var; Postgres has no
-- way to read it. platform_admins is the Postgres-side mirror of that same
-- allowlist, checked by is_platform_admin() below. These two lists are
-- independent and must be kept in sync by hand (see SETUP_TODO.md) — the env
-- var gates *reaching* /admin at all (middleware), this table gates what an
-- authenticated request can actually read/write once there (RLS).

create table platform_admins (
  email text primary key
);

alter table platform_admins enable row level security;
-- Deliberately no policies: nobody reads or writes this table through the
-- API, ever, including admins themselves — it's only consulted from inside
-- is_platform_admin() below (SECURITY DEFINER bypasses RLS on the tables it
-- queries). Managed by hand via Supabase Studio's Table Editor.

-- Is the current authenticated user a platform admin? Mirrors is_staff_of()'s
-- shape (02_rls.sql) — SECURITY DEFINER so this can read auth.users (not
-- normally exposed to authenticated roles) and platform_admins (no policies
-- of its own) without recursion or permission errors. Case-insensitive
-- match, same as middleware.ts's PLATFORM_ADMIN_EMAILS check. Also callable
-- directly as an RPC (app/admin/page.tsx uses this to distinguish "not a
-- platform admin yet" from "this platform genuinely has zero tenants").
create function is_platform_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from auth.users u
    join public.platform_admins pa on lower(pa.email) = lower(u.email)
    where u.id = auth.uid()
  );
$$;

-- restaurants: admins can see and edit every tenant's plan/status. Combined
-- with the existing "staff update restaurants" policy (02_rls.sql) via OR —
-- an admin doesn't need to also be staff of a restaurant to manage it.
create policy "platform admin read restaurants" on restaurants for select using (is_platform_admin());
create policy "platform admin update restaurants" on restaurants for update
  using (is_platform_admin()) with check (is_platform_admin());

-- subscriptions: admins can see every tenant's billing history and record a
-- new payment confirmation. Insert only, not update — each confirmation is
-- an append-only ledger entry, not an edit of a past one (see design spec's
-- "Payment confirmation is append-only" section).
create policy "platform admin read subscriptions" on subscriptions for select using (is_platform_admin());
create policy "platform admin insert subscriptions" on subscriptions for insert with check (is_platform_admin());
