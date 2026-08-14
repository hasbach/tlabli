# Owner-Side Data Wiring — Design

Date: 2026-08-15
Status: Approved

## Context

This is sub-project 3 in "wire in Supabase": Schema + RLS (done, merged) →
Auth (done, merged) → **owner-side data wiring** (this spec). The Auth spec's
context section sketched a further "storefront wiring" sub-project after this
one; this spec absorbs the core of that instead of deferring it again,
because it turns out the two can't be cleanly separated — see "Why the
storefront is in scope here" below.

Today, `/dashboard` is gated behind real login (middleware + Supabase Auth),
but every page still reads `lib/mock-data.ts` via a hardcoded `restaurants[0]`
lookup, regardless of who's logged in (`app/dashboard/settings/page.tsx:6` has
the `// TODO(supabase):` marker calling this out explicitly). Every write in
the dashboard (menu builder, order queue, settings, team) only updates local
React state and resets on reload. This spec makes all of it real: the
logged-in owner's actual restaurant, actual menu/order/settings/staff data,
actual persistence.

### Why the storefront is in scope here

Three decisions made during brainstorming pull the customer-facing storefront
into this sub-project, not just the dashboard:

1. **Checkout writes real orders.** For the dashboard's kitchen queue to show
   anything beyond hand-seeded rows, checkout (`components/storefront/cart-drawer.tsx`)
   must insert into `orders` — it can no longer be purely a `wa.me` link
   builder.
2. **The menu builder's own promise.** `app/dashboard/menu/page.tsx` already
   tells the owner "changes here are what your customers see instantly on
   your live menu." That's only true if the storefront template pages
   (`/burger-house`, `/sweet-crumbs`, `/le-jardin`, `/cafe-terra`) read the
   same real menu data the dashboard writes — today both sides read
   `lib/mock-data.ts` independently, which happens to look connected but
   isn't.
3. **Order tracking.** `/order/[id]` needs to read the real order checkout
   just created, not a mock lookup.

So in addition to the dashboard, this spec includes: the storefront template
pages' restaurant/menu lookup (`lib/menu.ts`, `getRestaurantBySlug`), the
checkout write path, and the order-tracking page's read path. It does **not**
include the admin panel (`/admin`) — that stays mock data; see "Explicitly
out of scope."

## Architecture

New files:

- **`lib/supabase/server.ts`** — cookie-aware server client (`createServerClient`
  from `@supabase/ssr`, cookies via `next/headers`). `setAll` is a no-op in
  Server Components (they can't write cookies) — safe, since `middleware.ts`
  already refreshes the session cookie on every `/dashboard/*` request.
- **`lib/supabase/admin.ts`** — service-role client (`SUPABASE_SERVICE_ROLE_KEY`),
  used only by staff-account creation, mirroring `scripts/seed-staff-logins.mjs`'s
  existing pattern. Never imported by client (`"use client"`) code.
- **`lib/dashboard/current-restaurant.ts`** — `getCurrentRestaurant()`, wrapped
  in React's `cache()` so every Server Component in one request's render tree
  shares a single query. Resolves `auth.uid() → staff_users → restaurants`,
  returns `{ restaurant, role } | null`.
- **`lib/analytics.ts`** — `getAnalyticsSnapshot(restaurantId)`: shared
  aggregation used by both `/dashboard` (today's stat cards) and
  `/dashboard/analytics` (full snapshot), so the logic lives once, not twice.
  Computed via a couple of scoped queries against `orders` (date-range fetch,
  aggregate `topItems`/`salesTrend`/`peakHours` in JS — per-restaurant volume
  is small enough that this doesn't need a SQL view or materialized rollup).
- **`lib/actions/`** — Server Actions (`"use server"`), grouped by domain:
  `menu-actions.ts` (category/item CRUD, availability toggle),
  `order-actions.ts` (`advanceOrderStatus`, `createOrder` — called from the
  storefront, not just the dashboard), `settings-actions.ts`
  (`updateRestaurantSettings`), `staff-actions.ts` (`addStaffMember`,
  `removeStaffMember`, `updateStaffRole`).
- **`supabase/sql/06_orders.sql`** — adds a `create_order(...)` RPC (same
  `SECURITY DEFINER` bootstrap-RPC pattern as `create_restaurant_with_owner`
  in `05_auth.sql`) that computes the next `queue_number` for a restaurant and
  inserts the order row in one transaction, avoiding a read-then-write race
  between concurrent checkouts.

**Key decision — RLS does the authorization work.** Ordinary dashboard writes
(menu edits, order status, settings) go through the cookie-authenticated
server client, so `is_staff_of()` (already defined in `02_rls.sql`) scopes
every write to the caller's own restaurant automatically — Server Actions
don't re-implement that check. Only staff-account *creation* needs the
service-role client, because creating an `auth.users` row isn't something RLS
can gate.

## Data flow by page

- **`/dashboard` layout** (`app/dashboard/layout.tsx`, modified) calls
  `getCurrentRestaurant()` once and redirects to `/login` if it's `null`
  (covers an authenticated session with no `staff_users` row — see Error
  Handling). Passes the restaurant down instead of every page doing its own
  `restaurants[0]` lookup.
- **`/dashboard` (Overview)** — fetches today's active orders (limit 6) +
  `getAnalyticsSnapshot()` for the stat cards. `OrderQueueBoard` (already
  `"use client"`, already takes `initialOrders`) adds a Supabase Realtime
  subscription (`postgres_changes` on `orders`, filtered
  `restaurant_id=eq.<id>`) merging inserts/status updates into its existing
  local state — no prop-shape change.
- **`/dashboard/menu`** — fetches `menu_categories` + `menu_items` +
  `item_addons` for the restaurant. `MenuBuilder`'s existing local-state
  handlers call the matching Server Action, then `revalidatePath` refreshes
  server data.
- **`/dashboard/orders`** — same real data + Realtime subscription as
  Overview, unfiltered. "Completed today" table becomes a real query
  (`status in (completed, cancelled)`, `created_at` = today).
- **`/dashboard/settings`** — fetches the restaurant row + `staff_users`.
  `SettingsForm` calls `updateRestaurantSettings`. `TeamSection` calls
  `addStaffMember` (name, phone, role, email, temp password → creates the
  `auth.users` row via the admin client, then a linked `staff_users` row),
  `removeStaffMember`, `updateStaffRole`.
- **`/dashboard/analytics`** — calls the same `getAnalyticsSnapshot()`,
  unchanged `AnalyticsCharts` component.
- **Storefront template pages** (`/burger-house` etc.) — `getRestaurantBySlug`
  and `getMenuSections` (`lib/menu.ts`) switch from `lib/mock-data.ts` to real
  Supabase reads (anonymous, public-read RLS policies already exist for
  `restaurants`, `menu_categories`, `menu_items`, `item_addons`).
- **Checkout** (`components/storefront/cart-drawer.tsx`) — "Place order" also
  calls the `createOrder` Server Action (anonymous insert, already allowed by
  RLS), which calls `create_order`, then still opens the `wa.me` link exactly
  as today.
- **`/order/[id]`** — reads the real order row instead of mock data (public
  read RLS on `orders` already exists).

## Error handling

- **No restaurant for the logged-in user** — handled once in
  `app/dashboard/layout.tsx` (see above), not duplicated per page.
- **Server Action failures** — every action returns
  `{ error: string } | { data: T }` rather than throwing, so forms show an
  inline error instead of crashing.
- **Staff creation** — if the `staff_users` insert fails after the
  service-role client already created the `auth.users` row, `addStaffMember`
  deletes that just-created auth user before returning the error, avoiding an
  orphaned login with no restaurant.
- **Realtime** — relies on supabase-js's built-in reconnect; `OrderQueueBoard`
  unsubscribes on unmount. No custom reconnect logic.
- **Order queue-number races** — handled inside `create_order`'s own
  transaction, not the app layer.
- **Checkout when Supabase is unreachable** — the `wa.me` link still opens
  even if `createOrder` fails (today's existing behavior is preserved); the
  failure is logged server-side, not surfaced to the customer, since the
  WhatsApp message remains the order record the restaurant actually sees.

## Verification approach

No automated test framework exists in this repo (`package.json` has none),
matching the Auth sub-project's precedent of manual verification against the
live, already-connected Supabase project rather than introducing test tooling
as a side effect of this work.

1. Run `06_orders.sql` against the live project.
2. Log in as the seeded Burger House owner; confirm all 5 dashboard pages
   show real data.
3. Place a real order through `/burger-house` checkout; confirm it lands in
   `orders` and appears live on `/dashboard` and `/dashboard/orders` without a
   reload, then advance its status and confirm it updates in both tabs.
4. Edit the menu (add/edit/delete category and item, toggle availability);
   confirm it persists across reload and shows up on the live storefront menu.
5. Add a team member with a temp password in Settings; log in as that account
   in a separate session to confirm it works and is scoped to the same
   restaurant only.
6. Confirm RLS boundaries hold across two different restaurants' owners (no
   cross-tenant visibility or writes).

This is manual, browser-driven verification, not automated test coverage —
done directly via the browser preview once implementation is complete, with
any step that can't be verified this way called out explicitly.

## Docs

- `SETUP_TODO.md`: mark item 1.7 (swap mock reads) done; add running
  `06_orders.sql`.
- `README.md`: update "Status" and "Known limitations" — dashboard and
  storefront menu/order data is real; local-state-only writes are gone.

## Explicitly out of scope

- **`/admin` (platform admin panel)** — stays mock data. The Auth spec's own
  deferred item ("no platform-admin RLS bypass" — every policy scopes to
  `is_staff_of`, with no cross-tenant path) remains unresolved; a future
  sub-project must add a cross-tenant RLS policy or a `SECURITY DEFINER`
  admin RPC before wiring `/admin` to real queries.
- **Photo upload** — menu items keep the CSS/icon placeholder; the
  `menu-photos` storage bucket exists but no upload UI is added here (see
  SETUP_TODO.md item 5 — an undecided content question, not a data-wiring
  one).
- **Staff invite-link flow** — staff accounts are created directly by the
  owner (email + temp password via the service-role client), not a
  self-service invite/claim flow.
- **WhatsApp Cloud API** — checkout still opens a `wa.me` link; automatic
  server-side WhatsApp notifications are unchanged (SETUP_TODO.md item 2).
- **Rate-limiting / abuse prevention** on `createOrder` (e.g. spam orders) —
  not a security bug (RLS still scopes correctly), just an unhandled
  business-logic edge case, acceptable for now.
- **Live exchange-rate lookup** — `lbpExchangeRate` stays an owner-editable
  field, not fetched from a rates API.
