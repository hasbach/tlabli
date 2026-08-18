# Print orders — design

Date: 2026-08-19

## Problem

Restaurant staff need to print physical tickets for incoming orders: a receipt for the
customer or delivery driver, a kitchen prep ticket, and (for restaurants that need it) a
bar ticket for drinks. There is currently no printing of any kind in the dashboard.

## Constraints

- The app is a Next.js 14 App Router site deployed on Vercel. The server has no access to
  a restaurant's local network, so it cannot talk to a thermal printer's IP directly.
- The realistic "printer" is whatever device/printer the staff member's browser already
  has configured at the OS level (USB or network thermal printer, or even a regular
  office printer). Printing therefore goes through the standard browser print dialog
  (`window.print()`), the same way any web page prints today.
- No payment-method or paid/unpaid tracking exists on `orders` today, and none is being
  added by this feature — the POS ticket is a printed receipt handed over at the point of
  payment, not a payment-recording feature.
- `OrderLineItem.addons` is already a flat `string[]` of add-on labels captured at order
  time (not a live FK to `item_addons`), so ticket rendering needs no extra data fetch
  beyond the `Order` object already loaded in the dashboard.

## Scope

In scope:
- Three ticket roles: **POS**, **Kitchen**, **Bar**. Each is independently toggle-able per
  restaurant in Settings (POS and Kitchen default on, Bar defaults off).
- A "Print" control on each active order card in the queue board (used on both the
  dashboard overview mini-queue and the full `/dashboard/orders` page) with one button per
  *enabled* role.
- Clicking a print button opens the browser's native print dialog for a
  receipt-formatted ticket for that role and that order.
- POS tickets show full receipt detail (items, add-ons, unit prices, total, customer
  info). Kitchen/Bar tickets show items, add-ons, and quantities only — no prices.

Out of scope (explicitly not building):
- Any real network/hardware printer integration (ESC/POS, printer IP configuration, a
  local print-bridge agent, or a paid cloud print service like PrintNode). Flagged during
  design as a possible future upgrade path, not part of this feature.
- Auto-printing new orders without a staff click. All printing is manual, staff-triggered.
- Automatic item-to-station routing (e.g. drinks auto-routed to the Bar ticket only). Every
  enabled ticket shows the full order; splitting by category was considered and explicitly
  declined to avoid a new menu-category "station" field.
- Payment-method capture or paid/unpaid order state.
- Printing from the "Completed today" table — print buttons only appear on active
  (non-completed, non-cancelled) order cards, matching where Cancel/Advance already live.
- Reprintable ticket URLs — tickets are rendered client-side from data already in memory
  and are not persisted or linkable.

## Data model

One migration, `supabase/sql/09_printer_settings.sql`, adding three columns to
`restaurants`:

```sql
alter table restaurants
  add column pos_printer_enabled boolean not null default true,
  add column kitchen_printer_enabled boolean not null default true,
  add column bar_printer_enabled boolean not null default false;
```

No new table and no RLS changes: the existing `"staff update restaurants"` policy
(`for update using (is_staff_of(id))`, in `02_rls.sql`) already covers any column on the
restaurant's own row, and `"public read restaurants"` already exposes these columns
read-side (harmless — they're just booleans describing what the restaurant prints on,
not sensitive).

`Restaurant` type (`lib/types.ts`) gains:
```ts
posPrinterEnabled: boolean;
kitchenPrinterEnabled: boolean;
barPrinterEnabled: boolean;
```
`mapRestaurantRow` maps the three new snake_case columns accordingly.

## Settings UI

New `components/dashboard/printer-settings-form.tsx`, added to `/dashboard/settings`
directly under the existing `WhatsAppSettingsForm`, following the same self-contained
form-with-local-state-and-save-button pattern:

- Three `Switch` rows: "POS printer", "Kitchen printer", "Bar printer".
- A short explanatory line: printing goes through the browser's print dialog on whichever
  device is viewing the dashboard — no printer IP or hardware setup in this app, just make
  sure the receipt printer is set up as a printer on that device/computer.
- Saves via the existing `updateRestaurantSettings` action. `RestaurantSettingsPatch`
  (`lib/actions/settings-actions.ts`) gains `posPrinterEnabled`, `kitchenPrinterEnabled`,
  `barPrinterEnabled`, each mapped to its snake_case column the same way existing patch
  fields are.

## Order card print buttons

`components/dashboard/order-queue-board.tsx` gains a small button row on each active order
card, placed below the items list and above the existing Cancel/Advance footer. One
`Printer`-icon button per role, shown only when that role is enabled on the restaurant
(passed down as a `restaurant: { posPrinterEnabled, kitchenPrinterEnabled,
barPrinterEnabled }` prop from both call sites — `app/dashboard/page.tsx` and
`app/dashboard/orders/page.tsx` — alongside the `restaurantId` prop already passed today).

Clicking a button sets local state `printJob: { order, role } | null`. A new
`components/dashboard/print-ticket.tsx` component:
- Renders nothing visible in normal layout.
- When `printJob` is set, renders the ticket markup into a `createPortal(..., document.body)`
  target with `id="print-ticket"`.
- A `useEffect` calls `window.print()` once the ticket is in the DOM, and registers
  `window.onafterprint` to clear `printJob` back to `null` (with a `setTimeout` fallback
  clear, in case `afterprint` doesn't fire in some browser/print-preview path).

Print CSS (added to `app/globals.css`):
```css
@media print {
  body * { visibility: hidden; }
  #print-ticket, #print-ticket * { visibility: visible; }
  #print-ticket { position: absolute; top: 0; left: 0; width: 80mm; }
}
```
This hides the entire dashboard chrome during print and shows only the active ticket, at
an 80mm receipt width (prints fine, just narrow and top-left, on a standard printer too).

## Ticket content

Shared layout, different heading and fields by role. All computed directly from the
`Order` object already in memory — no new data fetch.

**POS** (`role: "pos"`):
```
{restaurant.name}
Order #{queueNumber}          {orderType label + table/address}
------------------------------
{qty}x {title}
   + {addon}, {addon}                          {unitPrice × qty}
...
------------------------------
TOTAL                                          {total} {currency}
------------------------------
{customerName}  {customerPhone}
{timestamp}
```

**Kitchen** / **Bar** (`role: "kitchen" | "bar"`), identical layout, heading swapped:
```
{restaurant.name}
KITCHEN TICKET  (or BAR TICKET)
Order #{queueNumber}          {orderType label + table/address}
------------------------------
{qty}x {title}
   + {addon}, {addon}
...
------------------------------
{timestamp}
```
No prices, no customer phone — just what prep staff needs to make the order.

## Error handling

No server round-trip happens on print (everything renders from data already held
client-side), so there's no new failure mode to handle beyond what already exists for
loading the order queue itself. If `window.print()` is unavailable (extremely old
browser), the button simply does nothing visible beyond opening/closing the hidden ticket —
acceptable given the target browsers are the ones already running this dashboard today.

## Testing

Following this project's existing convention (no automated test framework): `npm run
build`, then a live manual pass — toggle each printer setting on/off and confirm the
matching print button appears/disappears on an order card, and use the browser's print
preview (not actually sending to a physical printer, which isn't available in this
environment) to confirm each of the three ticket layouts renders the right fields.
