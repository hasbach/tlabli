# Admin Data Wiring — Design

Date: 2026-08-17
Status: Approved

## Context

This is sub-project 4 in "wire in Supabase": Schema + RLS (done, merged) →
Auth (done, merged) → Owner-side data wiring (done, merged) → **admin data
wiring** (this spec). `/admin` is the one surface every prior sub-project
explicitly deferred:

- The schema/RLS spec's "Known limitations" flagged "no platform-admin RLS
  bypass" — every policy in `02_rls.sql` scopes to `is_staff_of()`, with no
  cross-tenant path.
- The Auth spec resolved only the *identity* half — `PLATFORM_ADMIN_EMAILS`
  plus a `middleware.ts` check gate who can reach `/admin` — but added no
  RLS policy or RPC letting an allow-listed admin actually read or write
  across tenants, and said so explicitly: "the owner-side-wiring sub-project
  must add the actual cross-tenant RLS policy... before wiring `/admin` to
  real queries."
- The owner-data-wiring spec did not do that either — it wired everything
  else (`/dashboard`, the storefront) and explicitly punted `/admin` again,
  restating the same unresolved item.

So today `/admin` (`app/admin/page.tsx`, `components/admin/tenant-table.tsx`)
is real UI — gated behind a real session and the email allowlist — sitting on
top of `lib/mock-data.ts`'s `restaurants`/`subscriptions` arrays, mutated only
in local React state. This spec makes it real: the tenant list, the plan/
status changes, and the payment-confirmation recording all read and write the
live database, and — the part every prior spec deferred — a cross-tenant
access mechanism finally gets built.

## Cross-tenant access mechanism

**Decision: additive RLS policies gated by a new `is_platform_admin()`
SECURITY DEFINER function, backed by a new `platform_admins` table — not a
service-role client, and not admin-only RPCs.**

Three options were on the table (per the owner-data-wiring spec's own framing
of this exact tradeoff):

1. **Service-role client** (`lib/supabase/admin.ts`, already exists for
   staff-account creation). Simplest — zero new SQL, `/admin`'s Server
   Components and Actions just use `createAdminSupabaseClient()` and bypass
   RLS entirely. Rejected as the primary mechanism because it would make
   `middleware.ts`'s allowlist check the *only* thing standing between an
   ordinary logged-in restaurant owner and every tenant's billing data. A bug
   in that one `if` statement, a future refactor that adds a new admin
   Server Action without re-checking, or a route that accidentally imports
   the wrong client — any of those would silently expose the entire
   platform's data with no second line of defense. `/admin` is the single
   highest-blast-radius surface in this app (it's the only place that reads
   *every* tenant's data in one query), so it's the one place worth paying
   for defense in depth.
2. **Admin-only RPCs** (`admin_list_restaurants()`, `admin_update_tenant(...)`,
   mirroring `create_restaurant_with_owner`'s bootstrap-RPC pattern). Would
   work and would keep RLS as the enforcement layer, but loses Postgrest's
   ordinary query composition (`.select()`, `.update()`, `.order()`) that the
   rest of this codebase already relies on (`getCurrentRestaurant`'s
   `.select("role, restaurants(*)")`, every Server Action in
   `lib/actions/`). It would mean writing and maintaining a bespoke function
   per shape needed, for a feature that only ever needs plain
   select/update/insert on two tables — no multi-row atomicity requirement
   like `create_order`'s queue-number race actually had. Rejected as
   unnecessary machinery for what these two tables need.
3. **RLS policies gated by a predicate function** (the chosen option): add
   `is_platform_admin()`, in the same shape as `02_rls.sql`'s existing
   `is_staff_of()`, and a handful of new policies on exactly the two tables
   `/admin` touches. Ordinary Server Actions keep using the cookie-authenticated
   `createServerSupabaseClient()` — identical to every owner-side action — and
   RLS itself decides whether the caller may see or touch a given row. This
   keeps "RLS does the authorization work" (the owner-data-wiring spec's own
   stated principle) true for `/admin` too, and means the *only* code path
   that can read cross-tenant data requires Postgres itself to agree the
   caller is an admin — independent of whatever `middleware.ts` does or does
   not check.

### Where the admin allowlist actually lives, twice

`PLATFORM_ADMIN_EMAILS` is a Next.js env var; Postgres cannot read a Next.js
process's environment. An RLS policy needs something queryable inside the
database, so this spec adds a new table:

```sql
create table platform_admins (email text primary key);
```

`is_platform_admin()` joins `auth.users` (resolving `auth.uid()` to an email,
the same way `is_staff_of()` resolves it to a `staff_users` row) against this
table. This means **two independent lists of admin emails now exist** — the
env var (gates *reaching* `/admin` in `middleware.ts`) and this table (gates
what an authenticated request can actually read/write once there) — and nothing
keeps them in sync automatically. This is a deliberate tradeoff, not an
oversight:

- Considered and rejected: a Postgres GUC (`ALTER DATABASE ... SET
  app.platform_admin_emails = '...'`) instead of a table, so there's
  conceptually still "one list, read two ways." Rejected because setting a
  database-level GUC requires superuser/owner privileges the SQL Editor's
  session may not always have depending on the Supabase plan, is edited only
  via more SQL (no Table Editor UI), and is global to the database rather
  than swappable per-row — no real simplicity win over a table for a
  single-operator allowlist that changes maybe once a year.
- Considered and rejected: store `auth_user_id` instead of `email` in
  `platform_admins`, to avoid the "two lists" problem differently. Rejected
  because a brand-new admin's `auth_user_id` doesn't exist until they've
  signed up once — email is the only identifier available *before* that,
  which is exactly why `PLATFORM_ADMIN_EMAILS` itself is keyed on email.
  Using email in both places at least makes the two lists comparable at a
  glance.
- The failure mode of the two lists disagreeing is handled explicitly, not
  left to silently return zero rows (see "Guarding against the exact failure
  the Auth spec warned about" below) — and `SETUP_TODO.md` instructs the user
  to add the same email to both places as one combined step.

This is the real cost of choosing option 3 over option 1: more SQL to write
and reason about, and a manual sync step for every future admin. It buys a
security boundary that survives a mistake in the Next.js code, which — for
the platform's exclusive cross-tenant surface — is judged worth it.

### Exact SQL surface added (`supabase/sql/07_admin.sql`)

- `platform_admins` table — RLS enabled, **zero policies** (deliberate
  deny-all; nobody, including admins themselves, reads or writes this table
  through the API — only `is_platform_admin()`'s `SECURITY DEFINER` context
  touches it; managed by hand via Supabase Studio's Table Editor).
- `is_platform_admin()` — `SECURITY DEFINER`, `set search_path = ''`, same
  shape as `is_staff_of()`. No explicit `revoke`/`grant` (matching
  `is_staff_of()`'s own precedent — predicate helper functions used inside
  policies stay on Postgres's default grants, unlike the mutating bootstrap
  RPCs in `05_auth.sql`/`06_orders.sql`, which do restrict `execute`
  explicitly because they perform actions, not just answer a yes/no
  question).
- Four new policies, added to (not replacing) `02_rls.sql`'s existing ones —
  Postgres OR's multiple permissive policies for the same command, so an
  admin doesn't also need to be staff of a restaurant to manage it:
  - `restaurants`: admin `select`, admin `update`.
  - `subscriptions`: admin `select`, admin `insert` (no admin `update` — see
    "Payment confirmation is append-only" below).
- Nothing added for any other table. `/admin` never reads or writes menu,
  order, staff, or driver data for a tenant it doesn't operate — keeping the
  admin RLS surface exactly as wide as the feature, not a blanket bypass.

### Guarding against the exact failure the Auth spec warned about

The Auth spec's deferred-item note ends with: "every admin read/write will
silently return zero rows / fail" if this is left unresolved. Because this
spec's two allowlists (env var, table) can independently drift out of sync,
that exact failure mode is still reachable — e.g., someone is added to
`PLATFORM_ADMIN_EMAILS` (so middleware lets them into `/admin`) but nobody
remembers to also insert their row into `platform_admins` (so every RLS-scoped
query legitimately returns zero rows, which looks identical to "this platform
genuinely has zero restaurants"). `app/admin/page.tsx` calls
`supabase.rpc("is_platform_admin")` before rendering the table and shows an
explicit "you're not fully set up" message (distinct from "no tenants exist")
if it comes back false, errors, or the function doesn't exist yet (the
pre-migration state) — so this never degrades into a silent, confusing empty
table.

## What gets wired, and how

`app/admin/page.tsx` (Server Component) fetches `restaurants` (all rows) and
`subscriptions` (all rows, ordered `created_at desc`) through the ordinary
cookie-authenticated `createServerSupabaseClient()` — the new RLS policies
make this return every tenant's rows for an admin, exactly the same client
and query shape `getCurrentRestaurant()` already uses for an owner's own
restaurant. `lib/supabase/mappers.ts` gets one addition, `mapSubscriptionRow`,
following the file's existing pattern exactly.

### Latest subscription per restaurant, without new aggregation code

`subscriptions` is (and always was, per its schema — `period_start`/
`period_end`/`created_at`, no unique constraint per restaurant) a
naturally-repeating table: one row per billing period over a tenant's
lifetime, not a single mutable "current subscription" record. The mock data
happened to only ever have one row per restaurant, which let the original
`tenant-table.tsx` get away with a plain `.find()`. Ordering the real query
by `created_at desc` before passing it to `TenantTable` means that same
existing `.find(s => s.restaurantId === id)` call keeps working unchanged —
it naturally finds the most recent row first. No new "latest per group"
aggregation helper needed.

### Two admin mutations become three Server Actions, on purpose

The current mock UI has one "Manage tenant" sheet with a single save button
that always overwrites both `restaurants.status`/`plan_id` **and**
`subscriptions.period_start`/`period_end`/`payment_proof_ref` together, every
time. That conflates two operationally distinct admin actions — "change this
tenant's plan or status" (a correction, happens any time) and "record that a
payment came in" (an event, should happen only when a payment actually
happened) — and forcing every plan/status change to also stamp a new billing
period (or silently overwrite the last real one) is a real UX/data-integrity
problem once this is backed by a real, permanent database instead of
in-memory state that resets on reload.

This spec splits it into two independent forms/actions inside the same sheet
(the same reasoning the original admin-panel-staff-roles spec already used to
keep `TeamSection` separate from `SettingsForm`: "so the two don't get
tangled"):

- **`updateTenantPlanStatus(restaurantId, { planId, status })`** — plain
  `update` on `restaurants`, RLS-scoped via `is_platform_admin()`. Its own
  "Update plan & status" button, its own inline saved/error state.
- **`recordSubscriptionPayment({ restaurantId, periodStart, periodEnd,
  paymentProofRef })`** — plain `insert` into `subscriptions` (not an
  `update` — see below), RLS-scoped via the new admin insert policy. Its own
  "Record payment" button, its own inline saved/error state. Pre-filled from
  the tenant's latest subscription row so re-recording an unchanged period is
  a single click, but always writes a new row.

Both land in a new `lib/actions/admin-actions.ts`, following this codebase's
now-established Server Action shape exactly: `"use server"`, every function
returns `{ error: string } | { data: T }`, never throws, `revalidatePath("/admin")`
on success. Neither needs `lib/supabase/admin.ts` (the service-role client) —
unlike `addStaffMember`, nothing here creates an `auth.users` row, so the
ordinary RLS-scoped client is sufficient for both, and no admin action needs
an app-layer authorization re-check the way `addStaffMember` does (that
recheck exists there specifically because the service-role portion of that
action bypasses RLS; nothing here does).

### Payment confirmation is append-only, not an edit

`recordSubscriptionPayment` always inserts. It never updates the tenant's
existing subscription row in place. A billing history a platform operator can
trust is an append-only ledger of confirmations, not a single mutable field
that a later correction could quietly overwrite — the same reasoning
`orders` already gets (a `create_order` RPC and no order-editing UI, only new
statuses via `advanceOrderStatus`). The tradeoff: a typo in a just-recorded
payment reference isn't "fixed" by editing it, it's fixed by recording a
corrected entry (the sheet shows only the latest row, so this is invisible in
the common case; a full subscription-history view is explicitly out of scope
below).

### UI changes to `components/admin/tenant-table.tsx`

Converts from `useState`-only local mutation to the same
optimistic-where-safe / wait-then-close-where-not pattern already established
by this codebase's other forms:

- The **stat row** (total/active/past-due/plan-mix) stays derived from
  `restaurants` client state exactly as today — purely a `.filter()`/`.length`
  computation over already-fetched data, nothing to wire.
- **Plan & status**: not optimistic. Matches `settings-form.tsx`'s pattern
  (a multi-field form with one explicit save button) rather than
  `order-queue-board.tsx`'s single-click optimistic pattern — a status change
  is consequential enough (it can flip a tenant to `inactive`) that "wait for
  confirmation, show an inline error and keep the sheet open on failure"
  is the safer default than "flip immediately, silently revert on failure."
  Button disables while saving; on success the table's local `restaurants`
  state updates from the returned row and shows a brief "Saved" note; on
  failure shows an inline error and leaves the sheet open with the attempted
  values still in the form.
- **Record payment**: same wait-then-update pattern, independent submit
  state and inline error from the plan/status form above.

No new UI primitives — same `Sheet`/`Card`/`Input`/`Label`/`Button`/`Badge`
already used.

## Error handling

- **Not a platform admin per `platform_admins`, despite passing middleware's
  env-var check** — handled once in `app/admin/page.tsx` (see "Guarding
  against the exact failure the Auth spec warned about"), not duplicated per
  action. The Server Actions themselves don't re-check this — same principle
  as every owner-side action: RLS is the enforcement, the page-level check is
  purely so a misconfigured admin sees a clear message instead of a
  confusing empty table.
- **`updateTenantPlanStatus` / `recordSubscriptionPayment` failures** —
  return `{ error }`, never throw; the sheet shows the message inline and
  stays open so the admin doesn't lose their edits.
- **RLS denies a write outright** (e.g., `07_admin.sql` not yet applied, so
  `is_platform_admin()` doesn't exist and the policies referencing it don't
  exist either — meaning the *old*, staff-only policies are still the only
  ones in effect) — surfaces as a plain Postgrest error message via the same
  `{ error: error.message }` path; no special-casing needed beyond what
  already exists, since read access is already gated by the page-level
  `is_platform_admin()` check that would have already shown the setup banner
  before any mutation UI is reachable.

## Timezone

No date-bucketing or "today"/"this week" logic exists anywhere in the admin
panel — `periodStart`/`periodEnd` are plain owner-entered calendar dates
(`type="date"` inputs, stored as Postgres `date`, not `timestamptz`), not
computed from "now." `lib/beirut-time.ts` has nothing to add here; nothing in
this spec needs it.

## Docs

- `SETUP_TODO.md`: new step under item 1 — run `supabase/sql/07_admin.sql`,
  and insert a matching row into `platform_admins` for every email already
  in `PLATFORM_ADMIN_EMAILS` (one combined instruction, since the two lists
  must be kept in sync by hand — see above). Item 4 ("Collecting your own
  subscription payments") updated: the panel now really records confirmations
  and activates accounts, not mock data.
- `README.md`: "Status" and "Known limitations" updated — `/admin` is real
  data now; the cross-tenant access mechanism section explains
  `platform_admins`/`is_platform_admin()` briefly, pointing here for the full
  rationale.

## Explicitly out of scope

- **Full subscription history view.** The Manage sheet shows only the latest
  payment confirmation per tenant (matching what the mock UI already showed);
  browsing every past billing period is a natural follow-on, not built here.
- **Editing/deleting a past subscription row.** Append-only by design (see
  above); a correction is a new row, not an edit of an old one. If a truly
  wrong row needs removing, that's a direct Supabase Studio action, not an
  `/admin` UI feature.
- **A self-service "add platform admin" UI.** `platform_admins` is managed by
  hand via Supabase Studio's Table Editor, same operational tier as editing
  `PLATFORM_ADMIN_EMAILS` itself — this is a single-operator allowlist, not a
  multi-tenant permission system, matching the Auth spec's own reasoning for
  why `PLATFORM_ADMIN_EMAILS` is an env var and not a table in the first
  place.
- **Any admin visibility into a tenant's menu, orders, staff, or analytics.**
  `/admin` remains a billing/plan surface only, per
  `docs/superpowers/specs/2026-08-07-admin-panel-staff-roles-design.md`'s
  original scope — no new RLS policy is added for any table besides
  `restaurants` and `subscriptions`.
- **Rate-limiting / abuse prevention** on the two new Server Actions — not a
  security bug (RLS still scopes correctly to admins only), just an
  unhandled business-logic edge case, consistent with every other
  sub-project's treatment of this category.
- **Deleting a restaurant.** No tenant-offboarding/deletion flow exists in
  the mock UI today and none is added here.
