# Auth — Design

Date: 2026-08-08
Status: Approved

## Context

This is sub-project 2 of 4 in "wire in Supabase": **Schema + RLS** (done, merged) →
**Auth** (this spec) → owner-side wiring → storefront wiring. A real Supabase
project now exists — schema, RLS, storage bucket, and seed data are live
(verified with a real query in the previous session) — but the app still has
zero authentication anywhere: `/dashboard` and `/admin` are wide open, and
`/onboarding`'s final step is a static "explore the dashboard" screen that
creates nothing real.

The schema/RLS spec explicitly deferred two things to this sub-project (see
its "Known limitations" section):

1. **No platform-admin RLS bypass** — every policy scopes access to
   `is_staff_of(restaurant_id)`; there's no cross-tenant path for the
   already-built `/admin` panel.
2. **The signup bootstrap problem** — `restaurants` has no `INSERT` policy at
   all, and `staff_users`' write policy requires `is_staff_of(restaurant_id)`
   to already be true, which is circular for a brand-new restaurant's very
   first staff row. Something has to create both rows for a new owner in one
   step, bypassing that circularity deliberately and only there.

This spec fully resolves item 2, and resolves only the *identity* half of
item 1 (the `PLATFORM_ADMIN_EMAILS` allowlist + middleware check) — it adds
no RLS policy letting an allowlisted admin actually read or write across
tenants; every policy in `02_rls.sql` still scopes to `is_staff_of`. That's
invisible today since `/admin` reads mock data, but the owner-side-wiring
sub-project must add the actual cross-tenant RLS policy (or a
`SECURITY DEFINER` admin RPC, mirroring `create_restaurant_with_owner`'s
pattern) before wiring `/admin` to real queries, or every admin read/write
will silently return zero rows / fail. Explicitly out of scope, per the
approved design conversation: `/dashboard`'s displayed data (menu, orders,
analytics, settings) stays on `lib/mock-data.ts`, unchanged, regardless of
who is logged in. Gating login does not make the dashboard show *your*
restaurant's real data — that coupling is real (a real restaurant has a
fresh UUID that doesn't match any mock-data.ts string id) but deliberately
deferred to the owner-side-wiring sub-project, so this spec stays about
identity and session, not data.

## Auth method

Email + password, via Supabase Auth. Chosen over magic link (slower for
repeat daily logins) and phone/OTP (requires a paid third-party SMS provider
for a feature — logging into an admin dashboard — that isn't the
WhatsApp-ordering flow this market actually cares about).

## Session infrastructure

Switch from the plain `@supabase/supabase-js` browser client to
`@supabase/ssr` (Supabase's current recommended package for Next.js App
Router), so the browser and the server agree on the same cookie-based
session — required for `middleware.ts` and any future server component to
know who's logged in.

- `lib/supabase/client.ts` (modify): replace `createClient` (from
  `@supabase/supabase-js`) with `createBrowserClient` (from `@supabase/ssr`).
  Same exported `supabase` client shape, so nothing that already imports it
  needs to change.
- `lib/supabase/server.ts` (new): a `createServerSupabaseClient()` factory
  using `createServerClient` from `@supabase/ssr`, wired to Next.js's
  `cookies()`. Used by `middleware.ts`.

## Route protection

`middleware.ts` at the repo root, matching `/dashboard/:path*` and
`/admin/:path*`:

- No session → redirect to `/login`.
- Session exists, path is under `/admin`, and the session's email is not in
  the server-only `PLATFORM_ADMIN_EMAILS` env var (comma-separated, never
  exposed to the client — no `NEXT_PUBLIC_` prefix) → redirect to
  `/dashboard`.
- Otherwise → allow through.

This is the standard `@supabase/ssr` middleware pattern: build a response,
create a server client bound to the request/response cookie jar, call
`supabase.auth.getUser()` to refresh the session if needed, then branch on
the result.

## Platform admin identity

An env var allowlist (`PLATFORM_ADMIN_EMAILS`), not a database table.
Appropriate for a single-operator SaaS today — adding a second admin later
means adding an email to the env var, no migration needed. Revisit if this
ever needs to scale past a handful of operators.

## Login

`app/login/page.tsx` (new): a client component, matching this app's existing
pattern (every interactive piece of this app — `cart-drawer.tsx`,
`settings-form.tsx`, `team-section.tsx` — is `"use client"` with inline
handlers, no Server Actions anywhere yet). Email + password fields, calls
`supabase.auth.signInWithPassword`, redirects to `/dashboard` on success.
Always redirects to `/dashboard` regardless of admin status — a platform
admin who wants `/admin` just navigates there directly; middleware lets them
through since they're both authenticated and allow-listed.

## Signup (via onboarding)

`app/onboarding/page.tsx` step 4 (modify): currently a static "You're almost
live" screen with a button straight to `/dashboard`. Becomes a real form
(email + password) that, on submit:

1. Calls `supabase.auth.signUp({ email, password })`.
2. On success, calls `supabase.rpc("create_restaurant_with_owner", { p_name, p_slug, p_type, p_whatsapp_number })`, using the business name and WhatsApp number already collected in step 3 and the business type already chosen in step 1 (slug is derived client-side from the name, kebab-cased).
3. On RPC success, redirects to `/dashboard`.

### `create_restaurant_with_owner` RPC

New file `supabase/sql/05_auth.sql`, run after `04_seed.sql` against the
already-live project. A `SECURITY DEFINER` Postgres function — the one
deliberate, narrow hole in RLS's "no insert policy on `restaurants`" rule:

- Requires `auth.uid()` to be non-null (raises an exception otherwise — this
  function is only ever meant to be called by a just-signed-up, now-authenticated
  user).
- Inserts one `restaurants` row and one `staff_users` row
  (`role = 'owner'`, `auth_user_id = auth.uid()`) in the same transaction.
- Returns the new restaurant's id.
- `execute` is granted to `authenticated` only, revoked from `anon`/`public` —
  defense in depth, even though the `auth.uid() is null` check alone already
  makes an anonymous call fail cleanly.

A duplicate `slug` fails on `restaurants.slug`'s existing unique constraint;
the signup form shows that as a plain "that name's taken, try another" error.

## Logout

A "Log out" link/button added to `components/dashboard/sidebar.tsx` (modify),
near the existing "Running on demo data" note. Calls `supabase.auth.signOut()`
then navigates to `/login`.

## Seeding real logins for the existing demo staff

The 7 `staff_users` rows seeded in `04_seed.sql` all have `auth_user_id = null`
— no login exists for "Rami Abou Chacra" etc. today. Per the approved design,
this sub-project creates real accounts for them so the demo restaurants are
fully login-testable, not just newly-signed-up ones.

This must go through Supabase's Admin API (`auth.admin.createUser`), not a
raw SQL insert into `auth.users` — hand-crafting the password hash and the
matching `auth.identities` row via SQL is fragile and version-sensitive
against Supabase's internal auth schema, whereas the Admin API is the
officially supported way to create a user server-side. The Admin API
requires the `service_role` key, which must never be embedded in application
code or handed to any implementer/reviewer — it stays local to the user's
own machine, read only from their own `.env.local`.

New file `scripts/seed-staff-logins.mjs` (not part of `supabase/sql/`, since
it needs the JS Admin SDK, not plain SQL): a one-off script the user runs
themselves, once, after filling in `SUPABASE_SERVICE_ROLE_KEY`. For each of
the 7 seeded staff members (email addresses invented — not in
`lib/mock-data.ts`, which has no emails, only names/phones. Originally
planned to use the RFC 2606-reserved `.example` TLD, but live testing during
implementation showed Supabase's own signup validation rejects RFC
2606-reserved test domains (`.example`, `.test`, `.invalid`) outright as
"invalid" before creating any auth row — so these use `gmail.com` with
high-entropy, obviously-synthetic local parts instead, and one shared,
clearly-fake password), it calls
`admin.auth.admin.createUser(...)` then updates that person's `staff_users`
row's `auth_user_id` by matching on `name` (safe here — all 7 seeded names
are unique).

## Verification approach — different from the schema/RLS sub-project

That sub-project had no live database, so verification was manual
read-through only. This one has a real, live Supabase project (confirmed
working in the previous session), so the signup flow and the RPC can be
tested for real using the already-present anon key — no `service_role`
needed for that path, since `supabase.auth.signUp()` is a normal
anon-key-accessible operation. Implementers and the final verification pass
may create real test signups against the live project to confirm the flow
actually works end to end.

The one constraint: nobody but the user touches `SUPABASE_SERVICE_ROLE_KEY`,
and there is no self-service way to delete an auth user without it (Supabase
doesn't expose a client-side "delete my own account" call). So live
verification may leave a small amount of test data (a test signup, a test
restaurant row) in the project. This is acceptable — it's a dev/demo
database, not one with real customers yet — as long as whoever creates test
data reports exactly what was created, so the user can delete it via
Supabase Studio afterward if they want a clean slate.

## Docs

- `SETUP_TODO.md`: new steps — install `@supabase/ssr`, run
  `supabase/sql/05_auth.sql`, set `PLATFORM_ADMIN_EMAILS`, fill in
  `SUPABASE_SERVICE_ROLE_KEY` and run `scripts/seed-staff-logins.mjs`.
- `.env.example`: add `PLATFORM_ADMIN_EMAILS=`.

## Explicitly out of scope (deferred to owner-side wiring)

- Making `/dashboard` show the logged-in user's *actual* restaurant instead
  of the hardcoded `restaurants[0]` mock lookup (`components/dashboard/sidebar.tsx:19`,
  `app/dashboard/settings/page.tsx:6`).
- Any change to menu builder, orders, analytics, or team-section data
  sourcing — all stay on `lib/mock-data.ts`.
- Rate-limiting or abuse prevention on `create_restaurant_with_owner` (e.g.
  a single logged-in user calling it repeatedly to create many restaurants)
  — not a security bug today (each call still requires a real authenticated
  session), just an unhandled business-logic edge case, acceptable for now.
