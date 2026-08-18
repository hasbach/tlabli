# Print Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff print a POS receipt (for the customer or delivery driver), a kitchen prep ticket, and an optional bar ticket for any active order, using whatever printer their own device's browser already has set up — with each of the three roles independently toggle-able per restaurant in Settings.

**Architecture:** Three new boolean columns on `restaurants` (`pos_printer_enabled`, `kitchen_printer_enabled`, `bar_printer_enabled`) drive which "Print" buttons show on each order card in the existing `OrderQueueBoard`. Clicking one sets a `{ order, role }` print job in state; a new `PrintTicket` component renders that job's ticket into a `document.body` portal and calls `window.print()`, while a print-only CSS rule in `globals.css` hides everything else so only the ticket appears in the browser's print dialog. No new table, no new Server Action, no new data fetch on print — everything needed is already in the `Order`/`Restaurant` objects the dashboard already holds.

**Tech Stack:** Next.js 14 (App Router) Client Components, React `createPortal`, the browser's native `window.print()` — no new dependencies.

## Global Constraints

- No new table and no RLS change: the existing `"staff update restaurants"` policy (`for update using (is_staff_of(id))`, `02_rls.sql`) already covers the three new columns on the restaurant's own row.
- `mapRestaurantRow` must default the three new fields (`?? true` for POS/Kitchen, `?? false` for Bar) rather than casting `undefined` straight through — this matches the SQL column defaults, and means the print buttons render correctly with sensible defaults even before the migration below is applied to the live database (only *saving* a change via the new Settings form will fail until then, the same graceful-degradation property every other not-yet-migrated table in this app already has).
- No payment-method or paid/unpaid tracking is added anywhere in this plan — the POS ticket is a printed receipt, not a payment-recording feature.
- Every enabled ticket shows the full order (no per-item Kitchen-vs-Bar routing) — this was explicitly decided against during design to avoid adding a "station" field to menu categories.
- Print buttons only appear on active order cards (`OrderQueueBoard`, used by both `/dashboard` and `/dashboard/orders`) — never on the "Completed today" table, matching where Cancel/Advance already live.
- Follow this codebase's established conventions exactly: Server Actions return `{ error: string } | { data: T }` and never throw; snake_case DB columns map to camelCase via `lib/supabase/mappers.ts`; no automated test framework exists (established project convention) — verification is `npm run build` plus manual/live testing against the real, already-connected Supabase project.
- New SQL (`supabase/sql/09_printer_settings.sql`) cannot be applied to the live project by any task in this plan — no `psql`/Supabase CLI link is available (confirmed repeatedly in prior sub-projects). It goes into `SETUP_TODO.md` for the user to run in Supabase Studio.

---

### Task 1: `09_printer_settings.sql` — printer role columns

**Files:**
- Create: `supabase/sql/09_printer_settings.sql`

**Interfaces:**
- Consumes: `restaurants` table (`01_schema.sql`), `"staff update restaurants"` policy (`02_rls.sql`) — both already live.
- Produces: three new columns on `restaurants`: `pos_printer_enabled boolean not null default true`, `kitchen_printer_enabled boolean not null default true`, `bar_printer_enabled boolean not null default false`. Task 2's mapper and Task 3's settings form read/write these by these exact column names.

- [ ] **Step 1: Create the file**

Create `supabase/sql/09_printer_settings.sql`:

```sql
-- 09_printer_settings.sql
-- Adds three independent printer-role toggles to restaurants. Paste into
-- Supabase Studio's SQL Editor and run AFTER 01_schema.sql through
-- 08_whatsapp.sql are already applied.
--
-- No new table and no RLS change needed: the existing "staff update
-- restaurants" policy (for update using (is_staff_of(id)), 02_rls.sql)
-- already covers any column on the restaurant's own row, and "public read
-- restaurants" already exposes these columns read-side — harmless, they're
-- just booleans describing what the restaurant prints on, not sensitive.
--
-- POS and Kitchen default to true (every restaurant needs a receipt for the
-- customer/driver and a kitchen prep ticket); Bar defaults to false since
-- most small restaurants don't have a separate bar station.

alter table restaurants
  add column pos_printer_enabled boolean not null default true,
  add column kitchen_printer_enabled boolean not null default true,
  add column bar_printer_enabled boolean not null default false;
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm:
- All three column names match exactly what Task 2's `mapRestaurantRow` and Task 3's `PrinterSettingsForm`/`updateRestaurantSettings` will use: `pos_printer_enabled`, `kitchen_printer_enabled`, `bar_printer_enabled`.
- Defaults match the design: POS `true`, Kitchen `true`, Bar `false`.
- No RLS statement was added — this migration is a pure `ALTER TABLE`, nothing else.

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/09_printer_settings.sql
git commit -m "feat: add printer role columns to restaurants (09_printer_settings.sql)"
```

---

### Task 2: `Restaurant` type, mapper, and settings patch

**Files:**
- Modify: `lib/types.ts` (currently 155 lines)
- Modify: `lib/supabase/mappers.ts` (currently 109 lines)
- Modify: `lib/actions/settings-actions.ts` (currently 33 lines)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Restaurant` gains `posPrinterEnabled: boolean`, `kitchenPrinterEnabled: boolean`, `barPrinterEnabled: boolean`; `mapRestaurantRow` populates them (with the `?? true`/`?? false` fallback from Global Constraints); `RestaurantSettingsPatch` gains the same three fields, and `updateRestaurantSettings` writes them. Task 3 (`PrinterSettingsForm`) and Task 4 (`OrderQueueBoard`, both dashboard pages) all read `restaurant.posPrinterEnabled` / `restaurant.kitchenPrinterEnabled` / `restaurant.barPrinterEnabled` by these exact names.

- [ ] **Step 1: Add the three fields to `Restaurant`**

In `lib/types.ts`, replace:

```ts
  whatsappNumber: string;
  phone: string;
  address: string;
}
```

with:

```ts
  whatsappNumber: string;
  phone: string;
  address: string;
  posPrinterEnabled: boolean;
  kitchenPrinterEnabled: boolean;
  barPrinterEnabled: boolean;
}
```

- [ ] **Step 2: Update `mapRestaurantRow`**

In `lib/supabase/mappers.ts`, replace:

```ts
    whatsappNumber: row.whatsapp_number as string,
    phone: row.phone as string,
    address: row.address as string,
  };
}
```

with:

```ts
    whatsappNumber: row.whatsapp_number as string,
    phone: row.phone as string,
    address: row.address as string,
    // Falls back to the same defaults as the SQL columns themselves
    // (09_printer_settings.sql) so the print buttons still render sensibly
    // even before that migration is applied to the live database — only
    // saving a change through PrinterSettingsForm depends on it existing.
    posPrinterEnabled: (row.pos_printer_enabled as boolean | null | undefined) ?? true,
    kitchenPrinterEnabled: (row.kitchen_printer_enabled as boolean | null | undefined) ?? true,
    barPrinterEnabled: (row.bar_printer_enabled as boolean | null | undefined) ?? false,
  };
}
```

- [ ] **Step 3: Extend `RestaurantSettingsPatch` and `updateRestaurantSettings`**

Read the actual current `lib/actions/settings-actions.ts` first and compare to the "before" block below — apply only the substantive change if it's drifted.

Replace:

```ts
export type RestaurantSettingsPatch = Partial<
  Pick<Restaurant, "name" | "whatsappNumber" | "tagline" | "address" | "currency" | "lbpExchangeRate" | "showBothCurrencies">
>;

export async function updateRestaurantSettings(
  restaurantId: string,
  patch: RestaurantSettingsPatch
): Promise<ActionResult<Restaurant>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.whatsappNumber !== undefined) update.whatsapp_number = patch.whatsappNumber;
  if (patch.tagline !== undefined) update.tagline = patch.tagline;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.lbpExchangeRate !== undefined) update.lbp_exchange_rate = patch.lbpExchangeRate;
  if (patch.showBothCurrencies !== undefined) update.show_both_currencies = patch.showBothCurrencies;

  const { data, error } = await supabase.from("restaurants").update(update).eq("id", restaurantId).select().single();
```

with:

```ts
export type RestaurantSettingsPatch = Partial<
  Pick<
    Restaurant,
    | "name"
    | "whatsappNumber"
    | "tagline"
    | "address"
    | "currency"
    | "lbpExchangeRate"
    | "showBothCurrencies"
    | "posPrinterEnabled"
    | "kitchenPrinterEnabled"
    | "barPrinterEnabled"
  >
>;

export async function updateRestaurantSettings(
  restaurantId: string,
  patch: RestaurantSettingsPatch
): Promise<ActionResult<Restaurant>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.whatsappNumber !== undefined) update.whatsapp_number = patch.whatsappNumber;
  if (patch.tagline !== undefined) update.tagline = patch.tagline;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.lbpExchangeRate !== undefined) update.lbp_exchange_rate = patch.lbpExchangeRate;
  if (patch.showBothCurrencies !== undefined) update.show_both_currencies = patch.showBothCurrencies;
  if (patch.posPrinterEnabled !== undefined) update.pos_printer_enabled = patch.posPrinterEnabled;
  if (patch.kitchenPrinterEnabled !== undefined) update.kitchen_printer_enabled = patch.kitchenPrinterEnabled;
  if (patch.barPrinterEnabled !== undefined) update.bar_printer_enabled = patch.barPrinterEnabled;

  const { data, error } = await supabase.from("restaurants").update(update).eq("id", restaurantId).select().single();
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/supabase/mappers.ts lib/actions/settings-actions.ts
git commit -m "feat: add printer settings fields to Restaurant type, mapper, and settings patch"
```

---

### Task 3: `PrinterSettingsForm` in dashboard Settings

**Files:**
- Create: `components/dashboard/printer-settings-form.tsx`
- Modify: `app/dashboard/settings/page.tsx` (currently 46 lines)

**Interfaces:**
- Consumes: `updateRestaurantSettings` (Task 2), `Restaurant` type (Task 2).
- Produces: `PrinterSettingsForm({ restaurant: Restaurant })` — a self-contained card with its own save state, same shape as the existing `WhatsAppSettingsForm`.

- [ ] **Step 1: Create the settings form component**

Create `components/dashboard/printer-settings-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Restaurant } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateRestaurantSettings } from "@/lib/actions/settings-actions";

export function PrinterSettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [posEnabled, setPosEnabled] = useState(restaurant.posPrinterEnabled);
  const [kitchenEnabled, setKitchenEnabled] = useState(restaurant.kitchenPrinterEnabled);
  const [barEnabled, setBarEnabled] = useState(restaurant.barPrinterEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateRestaurantSettings(restaurant.id, {
      posPrinterEnabled: posEnabled,
      kitchenPrinterEnabled: kitchenEnabled,
      barPrinterEnabled: barEnabled,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Printers</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <p className="text-sm text-muted-foreground">
          Tickets print through your device&apos;s own browser print dialog — there&apos;s no printer IP or hardware
          setup here. Just make sure your receipt printer is set up as a printer on whichever computer or tablet is
          running this dashboard, then use the Print buttons on each order in the queue.
        </p>

        <div className="flex items-center gap-3">
          <Switch
            id="printer-pos"
            checked={posEnabled}
            onCheckedChange={(checked) => {
              setPosEnabled(checked);
              setSaved(false);
            }}
          />
          <Label htmlFor="printer-pos" className="mb-0 cursor-pointer">
            POS printer — receipt for the customer or delivery driver
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="printer-kitchen"
            checked={kitchenEnabled}
            onCheckedChange={(checked) => {
              setKitchenEnabled(checked);
              setSaved(false);
            }}
          />
          <Label htmlFor="printer-kitchen" className="mb-0 cursor-pointer">
            Kitchen printer — prep ticket for kitchen staff
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="printer-bar"
            checked={barEnabled}
            onCheckedChange={(checked) => {
              setBarEnabled(checked);
              setSaved(false);
            }}
          />
          <Label htmlFor="printer-bar" className="mb-0 cursor-pointer">
            Bar printer — drink ticket, only if your restaurant has a separate bar station
          </Label>
        </div>

        <div className="flex items-center justify-between">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && <p className="text-sm text-success">Saved.</p>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add the card to the Settings page**

Read the actual current `app/dashboard/settings/page.tsx` first and compare to the "before" block below.

Replace:

```tsx
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { TeamSection } from "@/components/dashboard/team-section";
import { WhatsAppSettingsForm } from "@/components/dashboard/whatsapp-settings-form";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapStaffUserRow, mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";
```

with:

```tsx
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { TeamSection } from "@/components/dashboard/team-section";
import { WhatsAppSettingsForm } from "@/components/dashboard/whatsapp-settings-form";
import { PrinterSettingsForm } from "@/components/dashboard/printer-settings-form";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapStaffUserRow, mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";
```

Replace:

```tsx
      <SettingsForm restaurant={restaurant} />
      <div className="mt-6">
        <WhatsAppSettingsForm restaurant={restaurant} initialSettings={whatsappSettings} sentThisMonth={sentThisMonth ?? 0} />
      </div>
      <div className="mt-6">
        <TeamSection restaurant={restaurant} initialStaff={staff} />
      </div>
```

with:

```tsx
      <SettingsForm restaurant={restaurant} />
      <div className="mt-6">
        <WhatsAppSettingsForm restaurant={restaurant} initialSettings={whatsappSettings} sentThisMonth={sentThisMonth ?? 0} />
      </div>
      <div className="mt-6">
        <PrinterSettingsForm restaurant={restaurant} />
      </div>
      <div className="mt-6">
        <TeamSection restaurant={restaurant} initialStaff={staff} />
      </div>
```

No new data fetch is needed for this page — `restaurant` (from `getCurrentRestaurant()`, already called above) already carries the three new fields once Task 2's mapper change is in place.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Live manual verification**

Run `npm run dev`, log in as a real owner (following this project's disposable-test-account pattern if you don't already have real dashboard credentials — see prior sub-project notes), open `/dashboard/settings`. Confirm a new "Printers" card renders between the WhatsApp card and the team section, with POS and Kitchen switched on and Bar switched off by default (matching the mapper's fallback from Task 2, since `09_printer_settings.sql` hasn't been applied to the live project yet). Toggle Bar on, click "Save changes" — since the columns don't exist on the live database yet, expect a clean inline error (not a crash), same graceful-degradation behavior as every other not-yet-migrated field in this app. Report this exact caveat.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/printer-settings-form.tsx app/dashboard/settings/page.tsx
git commit -m "feat: add printer settings UI to dashboard Settings"
```

---

### Task 4: Print buttons + ticket rendering in the order queue

**Files:**
- Create: `components/dashboard/print-ticket.tsx`
- Modify: `components/dashboard/order-queue-board.tsx` (currently 155 lines)
- Modify: `app/dashboard/page.tsx` (currently 71 lines)
- Modify: `app/dashboard/orders/page.tsx` (currently 83 lines)
- Modify: `app/globals.css` (currently 192 lines)

**Interfaces:**
- Consumes: `Order`, `Restaurant` types (Task 2), `formatMoney` (`lib/currency.ts`).
- Produces: `PrintTicket({ job: PrintJob | null, onDone: () => void })` and its exported `PrintJob`/`PrintRole` types; `OrderQueueBoard` gains `restaurantName`, `posPrinterEnabled`, `kitchenPrinterEnabled`, `barPrinterEnabled` props.

- [ ] **Step 1: Create the print CSS rule**

In `app/globals.css`, append after the existing `.scrollbar-thin::-webkit-scrollbar-thumb` block (end of file):

```css

/* Print orders — #print-ticket (populated by components/dashboard/
   print-ticket.tsx) is the only thing that should ever reach a physical
   printer. Hidden by default; only shown, and only it, inside @media print. */
#print-ticket {
  display: none;
}

@media print {
  body * {
    visibility: hidden;
  }
  #print-ticket,
  #print-ticket * {
    visibility: visible;
  }
  #print-ticket {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 80mm;
  }
}
```

- [ ] **Step 2: Create the `PrintTicket` component**

Create `components/dashboard/print-ticket.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Order } from "@/lib/types";
import { formatMoney } from "@/lib/currency";

export type PrintRole = "pos" | "kitchen" | "bar";

export interface PrintJob {
  order: Order;
  role: PrintRole;
  restaurantName: string;
}

const ROLE_HEADING: Record<PrintRole, string | null> = {
  pos: null,
  kitchen: "KITCHEN TICKET",
  bar: "BAR TICKET",
};

function fulfillmentLine(order: Order): string {
  if (order.orderType === "table") return `Table ${order.tableNumber ?? "-"}`;
  if (order.orderType === "delivery") return order.address ?? "Delivery";
  return "Pickup";
}

export function PrintTicket({ job, onDone }: { job: PrintJob | null; onDone: () => void }) {
  useEffect(() => {
    if (!job) return;
    window.addEventListener("afterprint", onDone);
    window.print();
    const fallback = setTimeout(onDone, 5000);
    return () => {
      window.removeEventListener("afterprint", onDone);
      clearTimeout(fallback);
    };
  }, [job, onDone]);

  if (!job || typeof document === "undefined") return null;

  const { order, role, restaurantName } = job;
  const heading = ROLE_HEADING[role];
  const showPrices = role === "pos";

  return createPortal(
    <div id="print-ticket" className="font-mono text-xs leading-relaxed text-black">
      <p className="text-center text-sm font-bold">{restaurantName}</p>
      {heading && <p className="text-center font-bold">{heading}</p>}
      <p>
        Order #{order.queueNumber} — {fulfillmentLine(order)}
      </p>
      <hr className="my-1 border-black" />
      {order.items.map((item, idx) => (
        <div key={idx}>
          <div className="flex justify-between gap-2">
            <span>
              {item.quantity}x {item.title}
            </span>
            {showPrices && <span>{formatMoney(item.unitPrice * item.quantity, order.currency)}</span>}
          </div>
          {item.addons.length > 0 && <p className="pl-3">+ {item.addons.join(", ")}</p>}
        </div>
      ))}
      <hr className="my-1 border-black" />
      {showPrices && (
        <>
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{formatMoney(order.total, order.currency)}</span>
          </div>
          <p>
            {order.customerName} — {order.customerPhone}
          </p>
        </>
      )}
      <p>{new Date(order.createdAt).toLocaleString()}</p>
    </div>,
    document.body
  );
}
```

Note: `onDone` is passed a stable function reference by `OrderQueueBoard` (Step 3, via `useCallback`) — if it weren't stable, this effect would re-run (and call `window.print()` again) on every parent re-render while a job is set, which matters here specifically because `OrderQueueBoard` has a live Realtime subscription that can re-render it at any time.

- [ ] **Step 3: Wire print buttons and the restaurant's printer flags into `OrderQueueBoard`**

Read the actual current `components/dashboard/order-queue-board.tsx` first and compare to the "before" block below — apply only the substantive change if it's drifted.

Replace the full contents of `components/dashboard/order-queue-board.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, MapPin, Printer, Store, Utensils, X } from "lucide-react";
import type { Order } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { OrderStatusBadge, nextStatus } from "./order-status-badge";
import { advanceOrderStatus } from "@/lib/actions/order-actions";
import { supabase } from "@/lib/supabase/client";
import { PrintTicket } from "./print-ticket";
import type { PrintJob, PrintRole } from "./print-ticket";

const TYPE_ICON = { delivery: MapPin, pickup: Store, table: Utensils };

export function OrderQueueBoard({
  initialOrders,
  restaurantId,
  restaurantName,
  posPrinterEnabled,
  kitchenPrinterEnabled,
  barPrinterEnabled,
  limit,
}: {
  initialOrders: Order[];
  restaurantId: string;
  restaurantName: string;
  posPrinterEnabled: boolean;
  kitchenPrinterEnabled: boolean;
  barPrinterEnabled: boolean;
  limit?: number;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as Record<string, unknown>;
            const incoming: Order = {
              id: row.id as string,
              queueNumber: row.queue_number as number,
              restaurantId: row.restaurant_id as string,
              customerName: row.customer_name as string,
              customerPhone: row.customer_phone as string,
              orderType: row.order_type as Order["orderType"],
              tableNumber: (row.table_number as string) ?? undefined,
              address: (row.address as string) ?? undefined,
              items: row.items as Order["items"],
              total: Number(row.total),
              currency: row.currency as Order["currency"],
              status: row.status as Order["status"],
              driver: undefined,
              promoCode: (row.promo_code as string) ?? undefined,
              createdAt: row.created_at as string,
            };
            setOrders((prev) => {
              const exists = prev.some((o) => o.id === incoming.id);
              return exists ? prev.map((o) => (o.id === incoming.id ? incoming : o)) : [...prev, incoming];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const active = orders
    .filter((o) => o.status !== "completed" && o.status !== "cancelled")
    .sort((a, b) => a.queueNumber - b.queueNumber)
    .slice(0, limit);

  async function advance(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const target = nextStatus(order.status);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: target } : o)));
    const result = await advanceOrderStatus(id, target);
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
    }
  }

  async function cancel(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
    const result = await advanceOrderStatus(id, "cancelled");
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
    }
  }

  const clearPrintJob = useCallback(() => setPrintJob(null), []);

  function print(order: Order, role: PrintRole) {
    setPrintJob({ order, role, restaurantName });
  }

  const printRoles: { role: PrintRole; label: string; enabled: boolean }[] = [
    { role: "pos", label: "POS", enabled: posPrinterEnabled },
    { role: "kitchen", label: "Kitchen", enabled: kitchenPrinterEnabled },
    { role: "bar", label: "Bar", enabled: barPrinterEnabled },
  ];

  return (
    <>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active orders right now — kitchen&apos;s clear.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((order) => {
            const TypeIcon = TYPE_ICON[order.orderType];
            return (
              <Card key={order.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
                      #{order.queueNumber}
                    </span>
                    <OrderStatusBadge status={order.status} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold">{order.customerName}</p>
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <TypeIcon className="h-3 w-3" />
                      {order.orderType === "table" ? `Table ${order.tableNumber}` : order.orderType === "delivery" ? order.address : "Pickup"}
                    </p>
                  </div>

                  <ul className="flex-1 space-y-1 text-xs text-muted-foreground">
                    {order.items.map((i, idx) => (
                      <li key={idx}>
                        {i.quantity}x {i.title}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-1.5">
                    {printRoles
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <Button
                          key={p.role}
                          size="sm"
                          variant="outline"
                          onClick={() => print(order, p.role)}
                          className="gap-1 text-xs"
                        >
                          <Printer className="h-3 w-3" /> {p.label}
                        </Button>
                      ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-sm font-bold">{formatMoney(order.total, order.currency)}</span>
                    <div className="flex items-center gap-1.5">
                      {(order.status === "out_for_delivery" && order.orderType === "delivery") && (
                        <span className="text-xs text-muted-foreground">{order.driver?.name}</span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancel(order.id)}
                        className="gap-1 text-muted-foreground hover:text-destructive"
                        aria-label="Cancel order"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      {(order.status !== "out_for_delivery" || order.orderType !== "delivery") && (
                        <Button size="sm" variant="outline" onClick={() => advance(order.id)} className="gap-1">
                          Advance <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <PrintTicket job={printJob} onDone={clearPrintJob} />
    </>
  );
}
```

- [ ] **Step 4: Pass the new props from the dashboard overview page**

Read the actual current `app/dashboard/page.tsx` first and compare to the "before" block below.

Replace:

```tsx
        <OrderQueueBoard initialOrders={orders} restaurantId={restaurant.id} limit={6} />
```

with:

```tsx
        <OrderQueueBoard
          initialOrders={orders}
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          posPrinterEnabled={restaurant.posPrinterEnabled}
          kitchenPrinterEnabled={restaurant.kitchenPrinterEnabled}
          barPrinterEnabled={restaurant.barPrinterEnabled}
          limit={6}
        />
```

- [ ] **Step 5: Pass the new props from the full orders page**

Read the actual current `app/dashboard/orders/page.tsx` first and compare to the "before" block below.

Replace:

```tsx
        <OrderQueueBoard initialOrders={orders} restaurantId={restaurant.id} />
```

with:

```tsx
        <OrderQueueBoard
          initialOrders={orders}
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          posPrinterEnabled={restaurant.posPrinterEnabled}
          kitchenPrinterEnabled={restaurant.kitchenPrinterEnabled}
          barPrinterEnabled={restaurant.barPrinterEnabled}
        />
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors across all five modified/created files.

- [ ] **Step 7: Live manual verification**

Run `npm run dev`, log in as a real owner (disposable-test-account pattern if needed), open `/dashboard/orders`. Confirm: each active order card now shows a "POS" and "Kitchen" button (Bar defaults off, per Task 2's mapper fallback, so it should NOT appear yet). Click "POS" on one order — the browser's print dialog should open; use its print preview (do not actually send to a physical printer, none is available in this environment) and confirm the preview shows the restaurant name, order #, fulfillment line, each item with its add-ons and price, the total, and the customer name/phone — narrow, receipt-width. Cancel the print dialog, then click "Kitchen" on the same order and confirm the preview instead shows "KITCHEN TICKET", the same items/add-ons/quantities, and **no prices and no customer phone**. Then go to `/dashboard/settings`, toggle Bar on in the new Printers card (the toggle itself will show its known pre-migration save error per Task 3 — that's expected), and confirm the "Bar" button still does NOT appear on `/dashboard/orders` after a refresh, since the toggle couldn't actually persist without Task 1's migration — report this as the expected current-state result, not a bug. Also confirm the dashboard overview page's mini kitchen queue (`/dashboard`) shows the same POS/Kitchen buttons.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/dashboard/print-ticket.tsx components/dashboard/order-queue-board.tsx app/dashboard/page.tsx "app/dashboard/orders/page.tsx"
git commit -m "feat: add POS/Kitchen/Bar print buttons and ticket rendering to the order queue"
```

---

### Task 5: Update `SETUP_TODO.md`

**Files:**
- Modify: `SETUP_TODO.md` (currently 150 lines)

**Interfaces:**
- Consumes: nothing.

- [ ] **Step 1: Add the migration step**

Read the actual current `SETUP_TODO.md` first and compare to the "before" block below.

Replace:

```md
10. Enable Realtime for the `orders` table so the dashboard's kitchen queue
   updates live without a reload: in Supabase Studio, go to Database →
   Replication, and toggle on the `orders` table under the `supabase_realtime`
   publication (or run `ALTER PUBLICATION supabase_realtime ADD TABLE orders;`
   in the SQL Editor). Without this, order status changes and new orders still
   work correctly — the dashboard just needs a manual reload to show them.
```

with:

```md
10. Enable Realtime for the `orders` table so the dashboard's kitchen queue
   updates live without a reload: in Supabase Studio, go to Database →
   Replication, and toggle on the `orders` table under the `supabase_realtime`
   publication (or run `ALTER PUBLICATION supabase_realtime ADD TABLE orders;`
   in the SQL Editor). Without this, order status changes and new orders still
   work correctly — the dashboard just needs a manual reload to show them.
11. Also paste and run `supabase/sql/09_printer_settings.sql` — adds three
   printer-role toggle columns (POS/Kitchen/Bar) to `restaurants`, defaulting
   to POS and Kitchen on, Bar off. No other setup is needed for printing:
   tickets print through the browser's own print dialog on whichever device
   is running the dashboard, using whatever printer that device already has
   configured — there's no printer IP, driver, or cloud print service
   involved. Until this migration runs, the Printers card in
   `/dashboard/settings` will show a save error if you try to change a
   toggle, but the POS/Kitchen print buttons on the order queue already work
   correctly using the same true/true/false defaults this migration sets.
```

- [ ] **Step 2: Commit**

```bash
git add SETUP_TODO.md
git commit -m "docs: add printer settings migration step to SETUP_TODO.md"
```

---

### Task 6: Final build verification and live smoke test

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: build succeeds with no type errors across the whole app (not just the files touched in this plan) — confirms nothing in Tasks 1-5 broke an unrelated page.

- [ ] **Step 2: Live smoke test across both printer-consuming pages**

Run `npm run dev`. As a real logged-in owner:
1. `/dashboard` — confirm the mini kitchen queue's order cards show POS/Kitchen print buttons (Bar hidden), same as `/dashboard/orders`.
2. `/dashboard/orders` — print a POS ticket for a delivery order and a pickup order; confirm the delivery one's fulfillment line shows the address and the pickup one shows "Pickup" (from `fulfillmentLine` in `print-ticket.tsx`). Print a Kitchen ticket for an order that has an add-on (e.g. an item with "+ Extra cheese") and confirm the add-on line appears indented under the item, with no price shown anywhere on that ticket.
3. `/dashboard/settings` — confirm the Printers card, WhatsApp card, and profile card all still render together without visual overlap or layout breakage.
4. Cancel an order (existing Bug 1 feature from the prior sub-project) and confirm its print buttons disappear along with the rest of the card, since cancelled orders drop out of `active`.

- [ ] **Step 3: Report results**

Summarize: build status, and for each of the four smoke-test points above, what was observed — explicitly note the two known, expected pre-migration limitations (Bar toggle can't be saved yet; POS/Kitchen already default on via the mapper fallback) rather than treating them as bugs.
