# Driver dashboard — design

Date: 2026-09-27

## Problem

Delivery orders have no working driver flow. The pieces that exist today don't
connect:

- `drivers` (name, phone) and `orders.driver_id` exist in `01_schema.sql`, but the
  only drivers are the demo rows in `04_seed.sql`. Owners have no screen to add,
  edit or remove a driver.
- The order queue (`components/dashboard/order-queue-board.tsx`) only *displays*
  `order.driver?.name`. There is no way to assign a driver to an order.
- The customer tracking page (`app/order/[orderId]/page.tsx`) has a "Your driver"
  card, but it never renders: `mapOrderRow` hard-codes `driver: undefined`, and even
  if it didn't, `drivers` is staff-only under RLS, so an anonymous customer can't read
  the row.
- Drivers aren't users. They can't see their orders or mark one as delivered.

## Goal

An owner can add drivers, send each one a private link over WhatsApp, and
assign/reassign delivery orders from the queue. A driver opens their link on their
phone, sees only the orders currently assigned to them, and marks each one
**Picked up** and then **Delivered**. The customer sees the assigned driver's name and
phone on their tracking page.

## Constraints

- Drivers in Lebanon are often part-time and change often, and they already run
  everything through WhatsApp. They log in with a **magic link** (no account, no
  password): a long random token in the URL, `/driver/<token>`.
- A link is only as safe as the checks behind it, so **the driver page never trusts
  the token alone**. On every load and every action, the server checks the token
  *and* the order's current `driver_id`.
- Tokens are stored **hashed** (SHA-256). The plaintext exists only in the URL the
  owner sends. A leaked database dump can't be turned into working driver links.
- Drivers never get direct table access. Everything they do goes through
  `security definer` RPCs that take the token. The same narrow-bypass pattern is
  already used by `create_order` (`06_orders.sql`) and `create_restaurant_with_owner`
  (`05_auth.sql`).
- The project has no automated test framework (see Testing).

## Scope

In scope:
- Driver management in `/dashboard/settings`: add, edit, deactivate/reactivate, and
  reset link.
- Assigning, reassigning and unassigning drivers on delivery orders in the queue.
- A public, mobile-first driver page at `/driver/[token]` with Picked up and
  Delivered actions.
- An `order_driver_events` audit log of assignments and driver actions.
- The customer tracking page showing the assigned driver (fixing the current bug).

Out of scope (explicitly not building):
- Live GPS location tracking of drivers.
- Drivers declining or accepting orders themselves. Assignment is owner-only.
- Plan gating. The pricing page lists driver tracking under Pro, but the app has no
  per-feature plan gating today (only WhatsApp message caps). Drivers are available on
  every plan for now. Gating is a separate decision for all Pro features at once.
- A UI for the event log. It is written and can be queried in Supabase Studio. A
  per-order history view can come later if disputes actually happen.
- Driver pay, cash reconciliation, or delivery fees.
- Realtime push on the driver page (it polls; see Driver page).
- Deleting drivers. Owners deactivate instead, so the history stays intact.

## Data model

One migration, `supabase/sql/15_drivers.sql`.

### `drivers`: new columns

```sql
alter table drivers
  add column active boolean not null default true,
  add column token_hash text unique,          -- sha256 hex of the link token; null = no working link
  add column token_created_at timestamptz;
```

Existing seeded drivers get `token_hash = null`, which means no working link until the
owner taps "Reset link".

### `order_driver_events`: new table

```sql
create table order_driver_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  event text not null check (event in ('assigned','unassigned','picked_up','delivered')),
  actor text not null check (actor in ('staff','driver'))
);
create index on order_driver_events (order_id);
create index on order_driver_events (restaurant_id);
```

RLS: `enable row level security`, plus `staff read order_driver_events` for `select` and
`staff insert order_driver_events` for `insert`, both `using/with check
(is_staff_of(restaurant_id))`. No update or delete policy exists, so the log is
append-only for everyone except the service role. Driver-side rows are written by the
security-definer RPCs.

### Token helpers

pgcrypto lives in Supabase's `extensions` schema. Functions use `set search_path = ''`
(this project's convention), so they call `extensions.gen_random_bytes` and
`extensions.digest` with the schema written out.

- Token: `encode(extensions.gen_random_bytes(24), 'hex')`, which is 48 hex characters
  (192 bits).
- Hash: `encode(extensions.digest(token, 'sha256'), 'hex')`.

A private helper, `driver_from_token(p_token text) returns drivers`, hashes the input and
returns the matching row only if `active = true`. Every driver RPC calls it first.

## RPCs

### Owner-side (`security invoker`, so RLS still applies)

These are plpgsql functions so each multi-step change is atomic. Because they run as the
calling staff user, the existing `staff manage drivers` / `staff update orders` policies
and the new events policies do the authorization. They are `grant execute`'d to
`authenticated` only.

| Function | Does |
|---|---|
| `reset_driver_link(p_driver_id uuid) returns text` | Generates a new token, stores its hash and `token_created_at = now()`, and returns the **plaintext token** once. The previous link stops working immediately. Raises an error if the driver is inactive. |
| `assign_order_driver(p_order_id uuid, p_driver_id uuid) returns void` | `p_driver_id = null` means unassign. Rejects orders that aren't `order_type = 'delivery'`, orders already `completed`/`cancelled`, and inactive drivers or drivers from another restaurant. If the order already had a driver, logs `unassigned` for the old one. Then sets `driver_id` and logs `assigned` for the new one (actor `staff`). Assigning the same driver again does nothing. Does **not** change `status`. |
| `set_driver_active(p_driver_id uuid, p_active boolean) returns void` | Deactivating sets `active = false` and `token_hash = null` (the link dies), then unassigns the driver from all of their orders that aren't `completed`/`cancelled` and logs an `unassigned` event for each. Reactivating sets `active = true` only. The owner resets the link to send a new one. |

Plain create and edit of driver name/phone uses ordinary Server Actions with RLS. No RPC
is needed.

### Driver-side (`security definer`, granted to `anon` and `authenticated`)

All three take `p_token` and start with `driver_from_token`. If no active driver matches,
they raise `invalid_link`. They never return data from another driver or restaurant.

| Function | Does |
|---|---|
| `driver_get_orders(p_token text) returns jsonb` | Returns `{ driver: {name}, restaurant: {name, phone, currency settings}, orders: [...] }`. Orders are those where `driver_id = driver.id`, `order_type = 'delivery'` and `status in ('received','preparing','out_for_delivery')`, sorted by `queue_number`. Each order has `id, queue_number, customer_name, customer_phone, address, items, total, currency, status, created_at`. |
| `driver_mark_picked_up(p_token text, p_order_id uuid) returns void` | Requires `driver_id = driver.id`, otherwise raises `not_assigned`. Requires status `received` or `preparing`, otherwise raises `bad_status`. Sets `status = 'out_for_delivery'` and logs `picked_up` (actor `driver`). |
| `driver_mark_delivered(p_token text, p_order_id uuid) returns void` | Requires `driver_id = driver.id` (`not_assigned`) and status `out_for_delivery` (`bad_status`). Sets `status = 'completed'` and logs `delivered` (actor `driver`). |

The "check assignment, then update" in each mark function is one statement:
`update orders set ... where id = p_order_id and driver_id = v_driver.id and status in (...)`.
If it touches no rows, the function re-reads the order to decide whether to raise
`not_assigned` or `bad_status`. That way a reassignment racing a button tap can never let
the old driver complete the order.

### Customer tracking (`security definer`, granted to `anon`)

`get_order_driver(p_order_id uuid) returns table (name text, phone text)` returns the
assigned driver's name and phone only while the order has a driver and its status is
`received`, `preparing` or `out_for_delivery`. It returns nothing for completed or
cancelled orders. This exposes only the two fields the customer card needs. It does
not open up the `drivers` table.

## Owner UI

### Drivers card: `/dashboard/settings`

A new `components/dashboard/drivers-section.tsx`, modeled on `team-section.tsx`, with
Server Actions in a new `lib/actions/driver-actions.ts`.

- A list of drivers showing name, phone, an Active/Inactive badge, and the link state
  ("Link active since <date>" / "No link yet").
- **Add driver:** name and phone. After it's created, the app immediately calls
  `reset_driver_link` and shows the link dialog (below).
- **Edit:** name and phone.
- **Reset link:** asks for confirmation first ("Jad's current link will stop working."),
  then shows the link dialog.
- **Deactivate / Reactivate:** deactivating asks for confirmation and lists how many
  active orders will be unassigned.

**Link dialog.** Because only the hash is stored, the link can be shown **once**. The
dialog shows the full URL (`${NEXT_PUBLIC_SITE_URL}/driver/<token>`, falling back to the
current origin), a **Copy** button, and a **Send on WhatsApp** button. That button opens
`wa.me/<driver phone>` with the link pre-filled, reusing the phone formatting in
`lib/whatsapp.ts`. It also says: "This link won't be shown again. If it's lost, reset it
to get a new one."

### Order queue: `order-queue-board.tsx`

- The board gets a new `drivers` prop (active drivers for this restaurant), loaded by the
  pages that render it (`/dashboard` and `/dashboard/orders`).
- Each active **delivery** order card gets a driver select: "Unassigned" plus each active
  driver. Unassigned delivery orders show a small amber "No driver" badge so they stand
  out during a rush.
- Changing the select calls `assign_order_driver` through a Server Action.
  - If the order is already `out_for_delivery` and a driver is being swapped or removed,
    the app first asks: "<Name> already picked this order up. Reassign anyway?"
  - Completed and cancelled orders aren't on the board, so they can't be reassigned from
    there (the RPC enforces this too).
- The realtime handler already rebuilds the `Order` from `payload.new`. It now resolves
  `driver_id` against the `drivers` prop instead of hard-coding `driver: undefined`. So
  when a driver marks an order picked up or delivered, the card updates live, as long as
  Realtime is enabled for `orders` (SETUP_TODO item 1.10).
- Pickup and table orders are unchanged.

### Mappers and types

- `Order` gains `driverId?: string`. `mapOrderRow` sets `driverId` from `driver_id`.
- Staff pages select `*, driver:drivers(id, name, phone)`, and `mapOrderRow` maps the
  embedded `driver` when present. That replaces the hard-coded `undefined`.
- `Driver` gains `active: boolean` and `linkCreatedAt?: string`. It never includes the
  token or the hash.

## Driver page: `/driver/[token]`

- A new public route, `app/driver/[token]/page.tsx`, rendered on the server by calling
  `driver_get_orders`. It isn't in the middleware matcher, so no session is needed.
- `export const dynamic = "force-dynamic"`, `robots: { index: false }`, and a
  `Referrer-Policy: no-referrer` header (set for `/driver/:path*` in `next.config.mjs`),
  so the token doesn't leak to Google Maps or `tel:` handlers through the Referer header.
- Mobile-first layout:
  - Header: restaurant name, "Hi <driver name>", and a Refresh button.
  - One card per order: `#queue`, a status badge, the customer name with a tap-to-call
    button, the address with an **Open in Maps** link
    (`https://www.google.com/maps/search/?api=1&query=<address>`), an item summary, and
    the **total to collect** in the order's currency (dual currency shown the same way the
    storefront does).
  - Action button: **Picked up** while the status is `received`/`preparing`, then
    **Delivered** while it is `out_for_delivery`. Delivered asks for confirmation
    ("Mark #42 as delivered?").
  - Empty state: "No deliveries assigned right now."
- Freshness: a small client component calls `router.refresh()` every 30 seconds and
  whenever the tab regains focus. This avoids Realtime for anonymous users, and it also
  avoids depending on the public `orders` read policy, which is a known gap we don't want
  to build on.
- Actions are Server Actions (`lib/actions/driver-page-actions.ts`) that call the driver
  RPCs with the token from the route, then `revalidatePath` the driver page.
- Language: reuses `lib/i18n` (`LocaleProvider` + dictionaries) with en/ar/fr, including
  right-to-left layout, and adds `driver.*` keys. The switcher offers all three languages
  whatever the restaurant's menu languages are, since this setting is about the driver,
  not the menu.

## Error handling

| Case | Driver sees |
|---|---|
| Token matches no active driver (typo, reset, deactivated) | A full-page message: "This link is no longer active. Ask the restaurant for a new one." |
| `not_assigned` on an action (reassigned or unassigned meanwhile) | Toast: "This order was reassigned." Then the page refreshes and the card disappears. |
| `bad_status` (e.g. the owner already completed or cancelled it, or a double-tap) | Toast: "This order was already updated." Then the page refreshes. |
| Network or other error | Toast: "Couldn't update, try again." Button re-enabled. |

Owner-side RPC errors (inactive driver, non-delivery order, finished order) come back as
the usual `ActionResult` errors and are shown inline, matching the existing Server Actions.

## Security summary

- The token has 192 bits of randomness, is stored only as a SHA-256 hash, and is
  compared by hashing the input and looking up the unique `token_hash`.
- Driver RPCs return only that driver's active assigned orders and only allow two status
  changes (→ `out_for_delivery`, → `completed`), each tied to the current assignment in a
  single update.
- Revocation: Reset link or Deactivate takes effect on the driver's next request or
  action.
- Customers see only a driver's name and phone, only while that driver's order is in
  progress.
- Known limitation: anyone who gets hold of a driver's link can act as that driver until
  the owner resets it. That's the accepted trade-off of magic links. The owner-side reset
  is the mitigation.

## Setup

- `SETUP_TODO.md`, section 1: new step "Paste and run `supabase/sql/15_drivers.sql`".
  Until it runs, the Drivers card and the queue's driver select show save errors, and
  everything else keeps working.
- `README.md`: remove the implication that driver tracking works today, and list
  `/driver/<token>`.

## Testing

Following this project's convention (no automated test framework): `npm run build` and
`npm run lint`, then a live manual pass against Supabase with the migration applied:

1. Add a driver, copy the link, and open it in a private window. The page shows "No
   deliveries assigned right now."
2. Place a delivery order on a storefront and assign the driver in the queue. After a
   refresh (at most 30 seconds), the driver page shows it. The customer tracking page
   shows the driver's name and call button.
3. Tap Picked up. The queue card moves to Out for delivery live, and the tracking
   timeline updates.
4. Reassign to a second driver. The first driver's page drops the order. A stale
   Delivered tap from the first driver shows "This order was reassigned." The second
   driver sees the order with the Delivered button.
5. Tap Delivered as the second driver. The order moves to Completed today, and the
   driver's page empties.
6. Reset the second driver's link. The old URL shows "no longer active" and the new one
   works.
7. Deactivate a driver who has an active order. The order shows "No driver" in the
   queue, and their link dies.
8. Check `order_driver_events` in Supabase Studio: every step above logged the right
   event and actor.
9. Switch the driver page to Arabic and confirm the right-to-left layout.
10. Try a pickup order: it has no driver select, and the RPC rejects a manual attempt.
