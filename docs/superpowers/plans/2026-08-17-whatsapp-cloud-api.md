# WhatsApp Cloud API Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let checkout notify a restaurant automatically via the WhatsApp Cloud API — using either Tlabli's shared, metered/capped WhatsApp number or the restaurant's own Meta Business credentials — while keeping today's `wa.me` deep link as the fallback whenever Cloud API isn't configured, is over its cap, or fails.

**Architecture:** Two new staff-only-RLS tables (`whatsapp_settings`, `whatsapp_message_log`) hold per-restaurant config and a usage/audit log. `createOrder` (the existing Server Action) calls a new `lib/whatsapp-cloud-api.ts` module after the order row is written, using the service-role client (the same reasoning that put staff-account creation there — RLS can't safely let anonymous checkout read a secret token without also exposing it to anyone with the public anon key). The storefront page computes a cheap `whatsappCloudApiAvailable` boolean at render time so `CartDrawer` can keep its existing synchronous, pre-`await` `window.open()` popup-safety property while still skipping the deep link when Cloud API is expected to handle notification.

**Tech Stack:** Next.js 14 (App Router) Server Actions, Supabase (Postgres + RLS), native `fetch` with `AbortSignal.timeout()` for the Meta Cloud API call — no new dependencies.

## Global Constraints

- Two new tables are **staff-only RLS, no anonymous/public read policy** — `whatsapp_settings` can hold a real Meta access token, which must never be reachable with just the public anon key (the anon key ships in the client bundle; it is not a secret).
- Checkout is anonymous (no session), but still needs to read `whatsapp_settings` and count `whatsapp_message_log` — this happens through `createAdminSupabaseClient()` (`lib/supabase/admin.ts`, already exists), never the ordinary RLS-scoped client, for exactly the reason above.
- Plan caps for Tlabli's shared number (mode `'tlabli'`): Free 0, Basic 20, Pro 50, Custom unlimited (`null` in code). `'own'` mode (BYO credentials) is never capped — Tlabli isn't paying for those messages.
- `CartDrawer`'s `window.open(waLink)` call must stay fully synchronous — no `await` before it — to avoid browsers blocking it as an unsolicited popup. The Cloud-API-availability decision is computed once at page-load time (not per order) and passed down as a plain boolean prop; it is never awaited inside the click handler.
- Every WhatsApp Cloud API failure/timeout/skip must be caught and logged, never thrown — a Cloud API problem must never block or fail order creation, matching the existing rule that a Supabase outage doesn't block the WhatsApp deep link either.
- No automated test framework exists in this repo (established project convention) — verification is `npm run build` plus manual/live testing against the real, already-connected Supabase project. A live, successful Cloud API send cannot be verified without real Meta Business credentials and an approved template, which this plan does not have access to — every task's verification says exactly what can and can't be checked live.
- New SQL (`supabase/sql/08_whatsapp.sql`) cannot be applied to the live project by any task in this plan — no `psql`/Supabase CLI link is available (confirmed repeatedly in prior sub-projects). It goes into `SETUP_TODO.md` for the user to run in Supabase Studio.
- Follow this codebase's established conventions exactly: Server Actions return `{ error: string } | { data: T }` and never throw; snake_case DB columns map to camelCase via `lib/supabase/mappers.ts`; date/time bucketing for this Lebanon-only app uses `lib/beirut-time.ts`'s fixed +3h-offset helpers, never the server process's local timezone.

---

### Task 1: `whatsapp_settings` + `whatsapp_message_log` tables (`08_whatsapp.sql`)

**Files:**
- Create: `supabase/sql/08_whatsapp.sql`

**Interfaces:**
- Consumes: `restaurants`, `orders` tables (`01_schema.sql`), `is_staff_of()` (`02_rls.sql`), `is_platform_admin()` (`07_admin.sql`) — all already live.
- Produces: tables `whatsapp_settings(restaurant_id, created_at, mode, own_access_token, own_phone_number_id)` and `whatsapp_message_log(id, restaurant_id, order_id, created_at, status, error_message)`. Task 3's `lib/whatsapp-cloud-api.ts` and Task 4's `lib/actions/whatsapp-actions.ts` read/write these by these exact table and column names.

- [ ] **Step 1: Create the file**

Create `supabase/sql/08_whatsapp.sql`:

```sql
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
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm:
- `whatsapp_settings` has NO select policy of any kind — only `for all` scoped to `is_staff_of()`, which itself covers select/insert/update/delete for staff. There is deliberately no way for an anonymous or non-staff caller to read this table via PostgREST.
- `whatsapp_message_log`'s insert policy (`with check (true)`) is the only anonymous-accessible policy on either table, and it inserts no secret column.
- Every column referenced in a later task (`mode`, `own_access_token`, `own_phone_number_id`, `status`, `error_message`, `order_id`) is declared here with a matching name.
- `status`'s check constraint lists exactly the four values used by Task 3: `'sent'`, `'failed'`, `'skipped_over_cap'`, `'skipped_not_configured'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/08_whatsapp.sql
git commit -m "feat: add whatsapp_settings and whatsapp_message_log tables (08_whatsapp.sql)"
```

---

### Task 2: `WhatsAppSettings` type, mapper, and `beirutStartOfMonth` helper

**Files:**
- Modify: `lib/types.ts` (currently 148 lines)
- Modify: `lib/supabase/mappers.ts` (currently 101 lines)
- Modify: `lib/beirut-time.ts` (currently 45 lines)

**Interfaces:**
- Produces: `WhatsAppSettings` type (`restaurantId`, `mode: "tlabli" | "own"`, `ownAccessToken?`, `ownPhoneNumberId?`); `mapWhatsAppSettingsRow(row): WhatsAppSettings`; `beirutStartOfMonth(date: Date): Date`. Tasks 3, 4, 6, 7, 8 all import these by these exact names.

- [ ] **Step 1: Add the `WhatsAppSettings` type**

In `lib/types.ts`, append after the `AnalyticsSnapshot` interface (end of file):

```ts

export interface WhatsAppSettings {
  restaurantId: string;
  mode: "tlabli" | "own";
  ownAccessToken?: string;
  ownPhoneNumberId?: string;
}
```

- [ ] **Step 2: Add the mapper**

In `lib/supabase/mappers.ts`, update the type import line (currently line 8):

```ts
import type { Restaurant, MenuCategory, MenuItem, ItemAddon, Order, OrderLineItem, StaffUser, Subscription } from "@/lib/types";
```

with:

```ts
import type { Restaurant, MenuCategory, MenuItem, ItemAddon, Order, OrderLineItem, StaffUser, Subscription, WhatsAppSettings } from "@/lib/types";
```

Then append this function at the end of the file (after `mapSubscriptionRow`):

```ts

export function mapWhatsAppSettingsRow(row: Record<string, unknown>): WhatsAppSettings {
  return {
    restaurantId: row.restaurant_id as string,
    mode: row.mode as WhatsAppSettings["mode"],
    ownAccessToken: (row.own_access_token as string) ?? undefined,
    ownPhoneNumberId: (row.own_phone_number_id as string) ?? undefined,
  };
}
```

- [ ] **Step 3: Add `beirutStartOfMonth`**

In `lib/beirut-time.ts`, append after `beirutStartOfDaysAgo` (before `beirutWeekdayShort`):

```ts

/** ISO instant for the start (00:00:00, day 1) of the Beirut calendar month containing `date`. */
export function beirutStartOfMonth(date: Date): Date {
  const shifted = new Date(date.getTime() + BEIRUT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - BEIRUT_OFFSET_MS);
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors (none of these exports are used anywhere yet, so this only needs to type-check standalone).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/supabase/mappers.ts lib/beirut-time.ts
git commit -m "feat: add WhatsAppSettings type, mapper, and beirutStartOfMonth helper"
```

---

### Task 3: `lib/whatsapp-cloud-api.ts` — availability check + send

**Files:**
- Create: `lib/whatsapp-cloud-api.ts`

**Interfaces:**
- Consumes: `createAdminSupabaseClient` (`lib/supabase/admin.ts`), `mapWhatsAppSettingsRow` (Task 2), `beirutStartOfMonth` (Task 2), `Order`, `Restaurant`, `WhatsAppSettings` types.
- Produces: `getWhatsAppCloudApiAvailability(restaurantId: string, planId: Restaurant["planId"]): Promise<boolean>` (Task 6 calls this from the storefront page); `sendWhatsAppCloudApiNotification(restaurantId: string, orderId: string, order: Pick<Order, "items" | "total" | "currency" | "customerName" | "customerPhone" | "orderType" | "tableNumber" | "address">): Promise<{ sent: boolean }>` (Task 5 calls this from `createOrder`). Both names and signatures are exact — later tasks call them verbatim.

- [ ] **Step 1: Create the file**

Create `lib/whatsapp-cloud-api.ts`:

```ts
// -----------------------------------------------------------------------------
// WhatsApp Cloud API notification sending + availability. Reads
// whatsapp_settings/whatsapp_message_log via the service-role client (see
// supabase/sql/08_whatsapp.sql for why) — this module is called both from an
// anonymous storefront page render (getWhatsAppCloudApiAvailability) and an
// anonymous checkout Server Action (sendWhatsAppCloudApiNotification).
//
// Both functions independently check "is Cloud API actually configured"
// (platform env vars present, or BYO credentials present) using the exact
// same conditions — if they ever disagreed, a restaurant could be told
// "Cloud API will handle this" (skipping the deep link) while the send
// itself silently can't run, losing the notification entirely. That must
// never happen; a duplicate notification is fine, a missing one is not.
// -----------------------------------------------------------------------------

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";
import type { Order, Restaurant } from "@/lib/types";

const PLAN_CAPS: Record<Restaurant["planId"], number | null> = {
  free: 0,
  basic: 20,
  pro: 50,
  custom: null, // unlimited
};

const TEMPLATE_NAME = "new_order_notification";
const TEMPLATE_LANGUAGE = "en";

async function getSentCountThisMonth(restaurantId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const startOfMonth = beirutStartOfMonth(new Date()).toISOString();
  const { count } = await admin
    .from("whatsapp_message_log")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("status", "sent")
    .gte("created_at", startOfMonth);
  return count ?? 0;
}

export async function getWhatsAppCloudApiAvailability(
  restaurantId: string,
  planId: Restaurant["planId"]
): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("whatsapp_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  const settings = data ? mapWhatsAppSettingsRow(data) : null;

  if (settings?.mode === "own") {
    return Boolean(settings.ownAccessToken && settings.ownPhoneNumberId);
  }

  if (!process.env.WHATSAPP_CLOUD_API_TOKEN || !process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID) return false;

  const cap = PLAN_CAPS[planId];
  if (cap === null) return true;
  if (cap === 0) return false;
  const sentThisMonth = await getSentCountThisMonth(restaurantId);
  return sentThisMonth < cap;
}

function buildTemplateParams(
  order: Pick<Order, "items" | "total" | "currency" | "customerName" | "customerPhone" | "orderType" | "tableNumber" | "address">,
  restaurantName: string
): string[] {
  const itemLines = order.items
    .map((i) => `${i.quantity}x ${i.title}${i.addons.length ? ` (${i.addons.join(", ")})` : ""}`)
    .join("\n");
  const total = `${order.currency === "USD" ? "$" : ""}${order.total.toFixed(2)}${order.currency === "LBP" ? " L.L." : ""}`;
  const customer = `${order.customerName} (${order.customerPhone})`;
  const fulfillment =
    order.orderType === "table"
      ? `Table: ${order.tableNumber ?? "-"}`
      : order.orderType === "delivery"
        ? `Delivery to: ${order.address ?? "-"}`
        : "Pickup";

  return [restaurantName, itemLines, total, customer, fulfillment];
}

async function callMetaCloudApi(
  accessToken: string,
  phoneNumberId: string,
  toPhoneNumber: string,
  templateParams: string[]
): Promise<void> {
  const digitsOnly = toPhoneNumber.replace(/[^0-9]/g, "");
  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: digitsOnly,
      type: "template",
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANGUAGE },
        components: [
          {
            type: "body",
            parameters: templateParams.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta Cloud API responded ${response.status}: ${body}`);
  }
}

export async function sendWhatsAppCloudApiNotification(
  restaurantId: string,
  orderId: string,
  order: Pick<Order, "items" | "total" | "currency" | "customerName" | "customerPhone" | "orderType" | "tableNumber" | "address">
): Promise<{ sent: boolean }> {
  const admin = createAdminSupabaseClient();

  const [{ data: restaurantRow }, { data: settingsRow }] = await Promise.all([
    admin.from("restaurants").select("name, whatsapp_number, plan_id").eq("id", restaurantId).maybeSingle(),
    admin.from("whatsapp_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
  ]);

  if (!restaurantRow) return { sent: false };

  const restaurantName = restaurantRow.name as string;
  const restaurantWhatsappNumber = restaurantRow.whatsapp_number as string;
  const planId = restaurantRow.plan_id as Restaurant["planId"];
  const settings = settingsRow ? mapWhatsAppSettingsRow(settingsRow) : null;
  const mode = settings?.mode ?? "tlabli";

  async function log(status: string, errorMessage?: string) {
    await admin.from("whatsapp_message_log").insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      status,
      error_message: errorMessage ?? null,
    });
  }

  let accessToken: string | undefined;
  let phoneNumberId: string | undefined;

  if (mode === "own") {
    accessToken = settings?.ownAccessToken;
    phoneNumberId = settings?.ownPhoneNumberId;
    if (!accessToken || !phoneNumberId) {
      await log("skipped_not_configured");
      return { sent: false };
    }
  } else {
    accessToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
    phoneNumberId = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) {
      await log("skipped_not_configured");
      return { sent: false };
    }
    const cap = PLAN_CAPS[planId];
    if (cap !== null) {
      const sentThisMonth = await getSentCountThisMonth(restaurantId);
      if (sentThisMonth >= cap) {
        await log("skipped_over_cap");
        return { sent: false };
      }
    }
  }

  try {
    const templateParams = buildTemplateParams(order, restaurantName);
    await callMetaCloudApi(accessToken, phoneNumberId, restaurantWhatsappNumber, templateParams);
    await log("sent");
    return { sent: true };
  } catch (err) {
    await log("failed", err instanceof Error ? err.message : "Unknown error");
    return { sent: false };
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (nothing calls this module yet, so this only needs to type-check standalone).

- [ ] **Step 3: Manual read-through verification**

Confirm by reading:
- `getWhatsAppCloudApiAvailability` and `sendWhatsAppCloudApiNotification` check platform env-var presence with the identical condition (`!process.env.WHATSAPP_CLOUD_API_TOKEN || !process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`) for `'tlabli'` mode — this is the Global Constraint that prevents a lost notification.
- `sendWhatsAppCloudApiNotification` never throws — every branch either logs-and-returns or is inside the final `try`, whose `catch` also logs-and-returns.
- `PLAN_CAPS` matches the plan caps from Global Constraints exactly (Free 0, Basic 20, Pro 50, Custom `null`).
- `buildTemplateParams`'s five-element array order (`restaurantName, itemLines, total, customer, fulfillment`) matches the template's `{{1}}`–`{{5}}` order from the design spec.

- [ ] **Step 4: Commit**

```bash
git add lib/whatsapp-cloud-api.ts
git commit -m "feat: add WhatsApp Cloud API availability check and send function"
```

---

### Task 4: `updateWhatsAppSettings` Server Action

**Files:**
- Create: `lib/actions/whatsapp-actions.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (`lib/supabase/server.ts`), `mapWhatsAppSettingsRow` (Task 2), `WhatsAppSettings` type.
- Produces: `updateWhatsAppSettings(restaurantId: string, patch: WhatsAppSettingsPatch): Promise<ActionResult<WhatsAppSettings>>`. Task 7's `WhatsAppSettingsForm` calls this by this exact name.

- [ ] **Step 1: Create the file**

Create `lib/actions/whatsapp-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import type { WhatsAppSettings } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export type WhatsAppSettingsPatch = Partial<Pick<WhatsAppSettings, "mode" | "ownAccessToken" | "ownPhoneNumberId">>;

export async function updateWhatsAppSettings(
  restaurantId: string,
  patch: WhatsAppSettingsPatch
): Promise<ActionResult<WhatsAppSettings>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = { restaurant_id: restaurantId };
  if (patch.mode !== undefined) update.mode = patch.mode;
  if (patch.ownAccessToken !== undefined) update.own_access_token = patch.ownAccessToken || null;
  if (patch.ownPhoneNumberId !== undefined) update.own_phone_number_id = patch.ownPhoneNumberId || null;

  const { data, error } = await supabase
    .from("whatsapp_settings")
    .upsert(update, { onConflict: "restaurant_id" })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to save WhatsApp settings" };
  revalidatePath("/dashboard/settings");
  return { data: mapWhatsAppSettingsRow(data) };
}
```

Note: this uses `upsert`, not `update` — a restaurant may not have a `whatsapp_settings` row yet (the default `'tlabli'` mode needs no row at all), so the first save must create it. `onConflict: "restaurant_id"` targets the table's primary key (Task 1).

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/whatsapp-actions.ts
git commit -m "feat: add updateWhatsAppSettings Server Action"
```

---

### Task 5: Wire `createOrder` to send the Cloud API notification

**Files:**
- Modify: `lib/actions/order-actions.ts` (currently 65 lines)

**Interfaces:**
- Consumes: `sendWhatsAppCloudApiNotification` (Task 3).

- [ ] **Step 1: Call the notification after a successful order write**

Read the actual current `lib/actions/order-actions.ts` first and compare to the "before" block below — a prior sub-project's plan found one file's "before" snapshot had drifted slightly from reality by the time it was implemented; if this one differs, apply only the substantive change described below rather than reverting unrelated lines.

Replace:

```ts
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import type { Order, OrderStatus, OrderLineItem, Currency } from "@/lib/types";
```

with:

```ts
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import { sendWhatsAppCloudApiNotification } from "@/lib/whatsapp-cloud-api";
import type { Order, OrderStatus, OrderLineItem, Currency } from "@/lib/types";
```

Then replace the end of `createOrder` (from the `if (error || !data)` line to the end of the function):

```ts
  if (error || !data) {
    console.error(
      `createOrder failed for restaurant ${input.restaurantId}:`,
      error?.message ?? "no data returned from create_order RPC"
    );
    return { error: error?.message ?? "Failed to place order" };
  }
  const row = data as unknown as { id: string; queue_number: number };
  return { data: { id: row.id, queueNumber: row.queue_number } };
}
```

with:

```ts
  if (error || !data) {
    console.error(
      `createOrder failed for restaurant ${input.restaurantId}:`,
      error?.message ?? "no data returned from create_order RPC"
    );
    return { error: error?.message ?? "Failed to place order" };
  }
  const row = data as unknown as { id: string; queue_number: number };

  // Never let a WhatsApp problem affect order creation, which has already
  // succeeded by this point — sendWhatsAppCloudApiNotification is designed
  // to never throw, but this repo's rule is "never trust a call site not to
  // reject," so it's wrapped anyway.
  try {
    await sendWhatsAppCloudApiNotification(input.restaurantId, row.id, input);
  } catch (err) {
    console.error(`sendWhatsAppCloudApiNotification threw unexpectedly for order ${row.id}:`, err);
  }

  return { data: { id: row.id, queueNumber: row.queue_number } };
}
```

Note: `input` (the `CreateOrderInput` parameter) is passed directly as the `order` argument — its fields (`items`, `total`, `currency`, `customerName`, `customerPhone`, `orderType`, `tableNumber`, `address`) already structurally match `sendWhatsAppCloudApiNotification`'s expected `Pick<Order, ...>` shape, so no reshaping is needed.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors (confirms `CreateOrderInput`'s shape is structurally assignable to `sendWhatsAppCloudApiNotification`'s parameter type).

- [ ] **Step 3: Live manual verification**

This worktree has a real, already-connected Supabase project. `WHATSAPP_CLOUD_API_TOKEN`/`WHATSAPP_CLOUD_API_PHONE_NUMBER_ID` are unset in `.env.local` today (confirmed) and `whatsapp_settings`/`whatsapp_message_log` don't exist yet (Task 1's migration hasn't been applied — same known constraint as `06_orders.sql`/`07_admin.sql` before them). So a real checkout right now will hit `sendWhatsAppCloudApiNotification`, which will fail its `restaurants`/`whatsapp_settings` lookup (table doesn't exist) inside the try/catch added in Step 1, log the error, and NOT affect the checkout's own success/failure. Run `npm run dev`, place a real order through a storefront checkout (if `06_orders.sql` has been applied — otherwise this exercises the same "checkout succeeds regardless" path via the pre-existing WhatsApp-deep-link fallback instead), and confirm: checkout still completes normally, and the dev server log shows the caught error from the missing tables rather than a crash. Report this exact caveat — this task cannot be more thoroughly live-tested until Task 1's migration is applied.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/order-actions.ts
git commit -m "feat: send WhatsApp Cloud API notification from createOrder"
```

---

### Task 6: Storefront availability flag + conditional deep link

**Files:**
- Modify: `app/[restaurantSlug]/page.tsx` (currently 22 lines)
- Modify: `components/templates/index.tsx` (currently 21 lines)
- Modify: `components/templates/fast-food-template.tsx`, `components/templates/bakery-template.tsx`, `components/templates/fine-dining-template.tsx`, `components/templates/cafe-template.tsx`
- Modify: `components/storefront/cart-drawer.tsx` (currently 250 lines)

**Interfaces:**
- Consumes: `getWhatsAppCloudApiAvailability` (Task 3).
- Produces: `TemplateRenderer` and every `XTemplate`/`XBody` component now take a `whatsappCloudApiAvailable: boolean` prop; `CartDrawer` takes the same prop and uses it to decide whether to open the deep link.

- [ ] **Step 1: Compute the availability flag on the storefront page**

Replace the full contents of `app/[restaurantSlug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMenuSections, getRestaurantBySlug } from "@/lib/menu";
import { getWhatsAppCloudApiAvailability } from "@/lib/whatsapp-cloud-api";
import { TemplateRenderer } from "@/components/templates";

export async function generateMetadata({ params }: { params: { restaurantSlug: string } }): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) return {};
  return {
    title: `${restaurant.name} — Order online`,
    description: restaurant.tagline,
  };
}

export default async function RestaurantStorefrontPage({ params }: { params: { restaurantSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) notFound();

  const [sections, whatsappCloudApiAvailable] = await Promise.all([
    getMenuSections(restaurant.id),
    getWhatsAppCloudApiAvailability(restaurant.id, restaurant.planId),
  ]);

  return (
    <TemplateRenderer restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />
  );
}
```

- [ ] **Step 2: Thread the prop through `TemplateRenderer`**

Replace the full contents of `components/templates/index.tsx`:

```tsx
import type { Restaurant } from "@/lib/types";
import type { MenuSection } from "@/lib/menu";
import { FastFoodTemplate } from "./fast-food-template";
import { BakeryTemplate } from "./bakery-template";
import { FineDiningTemplate } from "./fine-dining-template";
import { CafeTemplate } from "./cafe-template";

export function TemplateRenderer({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  switch (restaurant.templateId) {
    case "fast-food":
      return <FastFoodTemplate restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />;
    case "bakery":
      return <BakeryTemplate restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />;
    case "fine-dining":
      return <FineDiningTemplate restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />;
    case "cafe":
      return <CafeTemplate restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />;
    default:
      return <FastFoodTemplate restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />;
  }
}
```

- [ ] **Step 3: Thread the prop through each template**

Each of the four template files (`fast-food-template.tsx`, `bakery-template.tsx`, `fine-dining-template.tsx`, `cafe-template.tsx`) has the same shape: an inner `XBody({ restaurant, sections })` component that renders `<CartDrawer ... />`, and an outer `XTemplate({ restaurant, sections })` that wraps it in providers. Apply this same mechanical change to all four files.

Using `fast-food-template.tsx` as the concrete example (apply the identical pattern to the other three, substituting their own component names):

Replace:

```tsx
function FastFoodBody({ restaurant, sections }: { restaurant: Restaurant; sections: MenuSection[] }) {
```

with:

```tsx
function FastFoodBody({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
```

Replace:

```tsx
      <CartDrawer restaurantId={restaurant.id} restaurantName={restaurant.name} whatsappNumber={restaurant.whatsappNumber} currency={restaurant.currency} />
```

with:

```tsx
      <CartDrawer
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        whatsappNumber={restaurant.whatsappNumber}
        currency={restaurant.currency}
        whatsappCloudApiAvailable={whatsappCloudApiAvailable}
      />
```

Replace:

```tsx
export function FastFoodTemplate({ restaurant, sections }: { restaurant: Restaurant; sections: MenuSection[] }) {
  return (
    <div className="theme-fast-food">
      <LocaleProvider availableLocales={restaurant.languages} defaultLocale={restaurant.languages[0]}>
        <CartProvider currency={restaurant.currency}>
          <FastFoodBody restaurant={restaurant} sections={sections} />
        </CartProvider>
      </LocaleProvider>
    </div>
  );
}
```

with:

```tsx
export function FastFoodTemplate({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  return (
    <div className="theme-fast-food">
      <LocaleProvider availableLocales={restaurant.languages} defaultLocale={restaurant.languages[0]}>
        <CartProvider currency={restaurant.currency}>
          <FastFoodBody restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />
        </CartProvider>
      </LocaleProvider>
    </div>
  );
}
```

Apply the same three replacements (inner body's prop destructuring, the `<CartDrawer>` call, the outer exported component's prop destructuring and pass-through) to `bakery-template.tsx` (`BakeryBody`/`BakeryTemplate`), `fine-dining-template.tsx` (`FineDiningBody`/`FineDiningTemplate`), and `cafe-template.tsx` (`CafeBody`/`CafeTemplate`) — read each file first to get its exact current component names and the exact current `<CartDrawer .../>` line (each already has `restaurantId`, `restaurantName`, `whatsappNumber`, `currency` — add `whatsappCloudApiAvailable={whatsappCloudApiAvailable}` as one more prop, same as this example).

- [ ] **Step 4: Make `CartDrawer`'s deep-link open conditional**

Read the actual current `components/storefront/cart-drawer.tsx` first and compare to the "before" blocks below — apply only the substantive change if it's drifted.

Replace:

```tsx
export function CartDrawer({
  restaurantId,
  restaurantName,
  whatsappNumber,
  currency,
}: {
  restaurantId: string;
  restaurantName: string;
  whatsappNumber: string;
  currency: Currency;
}) {
```

with:

```tsx
export function CartDrawer({
  restaurantId,
  restaurantName,
  whatsappNumber,
  currency,
  whatsappCloudApiAvailable,
}: {
  restaurantId: string;
  restaurantName: string;
  whatsappNumber: string;
  currency: Currency;
  whatsappCloudApiAvailable: boolean;
}) {
```

Replace:

```tsx
    // The wa.me link is today's real order record for the restaurant — it
    // must open even if the database write below fails, so a Supabase outage
    // never blocks a customer's order.
    const link = buildWhatsAppLink(whatsappNumber, message);
    if (typeof window !== "undefined") window.open(link, "_blank", "noopener,noreferrer");
```

with:

```tsx
    // The wa.me link must open synchronously, before any await, so browsers
    // don't block it as an unsolicited popup — this is why the
    // whatsappCloudApiAvailable check below can't wait for createOrder's
    // result. When Cloud API is expected to handle notification, skip the
    // deep link; otherwise (not configured, over cap, or createOrder fails
    // outright below) it's the only notification this order gets, so it
    // must open even if the database write below fails.
    if (!whatsappCloudApiAvailable) {
      const link = buildWhatsAppLink(whatsappNumber, message);
      if (typeof window !== "undefined") window.open(link, "_blank", "noopener,noreferrer");
    }
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors across all six modified/dependent files.

- [ ] **Step 6: Live manual verification**

Run `npm run dev`. `WHATSAPP_CLOUD_API_TOKEN`/`WHATSAPP_CLOUD_API_PHONE_NUMBER_ID` are unset today, so `getWhatsAppCloudApiAvailability` should return `false` for every restaurant regardless of plan — confirm the deep link still opens on checkout exactly as before this task (no behavior change yet, since Cloud API genuinely isn't available). This is the expected, correct state until the user configures real credentials and applies Task 1's migration — report it as such, not as a bug.

- [ ] **Step 7: Commit**

```bash
git add "app/[restaurantSlug]/page.tsx" components/templates/index.tsx components/templates/fast-food-template.tsx components/templates/bakery-template.tsx components/templates/fine-dining-template.tsx components/templates/cafe-template.tsx components/storefront/cart-drawer.tsx
git commit -m "feat: compute WhatsApp Cloud API availability and skip the deep link when it applies"
```

---

### Task 7: WhatsApp settings UI in the dashboard

**Files:**
- Create: `components/dashboard/whatsapp-settings-form.tsx`
- Modify: `app/dashboard/settings/page.tsx` (currently 27 lines)

**Interfaces:**
- Consumes: `updateWhatsAppSettings` (Task 4), `WhatsAppSettings` type (Task 2), `mapWhatsAppSettingsRow` (Task 2), `beirutStartOfMonth` (Task 2).

- [ ] **Step 1: Create the settings form component**

Create `components/dashboard/whatsapp-settings-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Restaurant, WhatsAppSettings } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateWhatsAppSettings } from "@/lib/actions/whatsapp-actions";

const PLAN_CAPS: Record<Restaurant["planId"], number | null> = {
  free: 0,
  basic: 20,
  pro: 50,
  custom: null,
};

const TEMPLATE_TEXT = "🔔 New order at {{1}}\n\n{{2}}\n\nTotal: {{3}}\nCustomer: {{4}}\n{{5}}";

export function WhatsAppSettingsForm({
  restaurant,
  initialSettings,
  sentThisMonth,
}: {
  restaurant: Restaurant;
  initialSettings: WhatsAppSettings | null;
  sentThisMonth: number;
}) {
  const [mode, setMode] = useState<WhatsAppSettings["mode"]>(initialSettings?.mode ?? "tlabli");
  const [ownAccessToken, setOwnAccessToken] = useState(initialSettings?.ownAccessToken ?? "");
  const [ownPhoneNumberId, setOwnPhoneNumberId] = useState(initialSettings?.ownPhoneNumberId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = PLAN_CAPS[restaurant.planId];

  function selectMode(next: WhatsAppSettings["mode"]) {
    setMode(next);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateWhatsAppSettings(restaurant.id, { mode, ownAccessToken, ownPhoneNumberId });
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
        <CardTitle>WhatsApp notifications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => selectMode("tlabli")}
            className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              mode === "tlabli" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
            }`}
          >
            Use Tlabli&apos;s WhatsApp number
          </button>
          <button
            type="button"
            onClick={() => selectMode("own")}
            className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              mode === "own" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
            }`}
          >
            Use my own WhatsApp Business API
          </button>
        </div>

        {mode === "tlabli" && (
          <p className="text-sm text-muted-foreground">
            {cap === null
              ? "Unlimited automatic notifications on your plan."
              : cap === 0
                ? "Your plan doesn't include automatic notifications — orders still open a WhatsApp deep link for the customer to send."
                : `${sentThisMonth} / ${cap} messages used this month — falls back to a WhatsApp deep link after that.`}
          </p>
        )}

        {mode === "own" && (
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="wa-token">Access token</Label>
              <Input
                id="wa-token"
                type="password"
                value={ownAccessToken}
                onChange={(e) => {
                  setOwnAccessToken(e.target.value);
                  setSaved(false);
                }}
                placeholder="Permanent access token from Meta Business"
              />
            </div>
            <div>
              <Label htmlFor="wa-phone-id">Phone number ID</Label>
              <Input
                id="wa-phone-id"
                value={ownPhoneNumberId}
                onChange={(e) => {
                  setOwnPhoneNumberId(e.target.value);
                  setSaved(false);
                }}
                placeholder="From your WhatsApp Business API settings"
              />
            </div>
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Submit this exact template for Meta approval first:</p>
              <p className="mt-1">
                Name: <code>new_order_notification</code>, category: <code>UTILITY</code>
              </p>
              <pre className="mt-1 whitespace-pre-wrap font-mono">{TEMPLATE_TEXT}</pre>
              <p className="mt-1">
                Notifications won&apos;t send until this template is approved on your own WhatsApp Business Account.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button
            onClick={handleSave}
            disabled={saving || (mode === "own" && (!ownAccessToken || !ownPhoneNumberId))}
          >
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

- [ ] **Step 2: Fetch settings + usage and render the card**

Read the actual current `app/dashboard/settings/page.tsx` first and compare to the "before" block below.

Replace the full contents of `app/dashboard/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { TeamSection } from "@/components/dashboard/team-section";
import { WhatsAppSettingsForm } from "@/components/dashboard/whatsapp-settings-form";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapStaffUserRow, mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";

export default async function SettingsPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const startOfMonthISO = beirutStartOfMonth(new Date()).toISOString();

  const [{ data: staffRows }, { data: whatsappSettingsRow }, { count: sentThisMonth }] = await Promise.all([
    supabase.from("staff_users").select("*").eq("restaurant_id", restaurant.id),
    supabase.from("whatsapp_settings").select("*").eq("restaurant_id", restaurant.id).maybeSingle(),
    supabase
      .from("whatsapp_message_log")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("status", "sent")
      .gte("created_at", startOfMonthISO),
  ]);

  const staff = (staffRows ?? []).map(mapStaffUserRow);
  const whatsappSettings = whatsappSettingsRow ? mapWhatsAppSettingsRow(whatsappSettingsRow) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Business profile, currency display, and your plan.</p>
      <SettingsForm restaurant={restaurant} />
      <div className="mt-6">
        <WhatsAppSettingsForm restaurant={restaurant} initialSettings={whatsappSettings} sentThisMonth={sentThisMonth ?? 0} />
      </div>
      <div className="mt-6">
        <TeamSection restaurant={restaurant} initialStaff={staff} />
      </div>
    </div>
  );
}
```

Note: `whatsapp_settings`/`whatsapp_message_log` don't exist on the live project until Task 1's migration is applied — until then, both queries above will error, and Supabase's client returns `{ data: null, error }` rather than throwing, so `whatsappSettingsRow` and `sentThisMonth` both safely fall back to `null`/`undefined` → `null`/`0`. The page must not crash either way; this is the same graceful-degradation property as every other query on this page.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Live manual verification**

Run `npm run dev`, log in as a real owner, open `/dashboard/settings`. Confirm the new "WhatsApp notifications" card renders between the profile card and the team section, defaults to "Use Tlabli's WhatsApp number" selected, and shows the correct cap message for that restaurant's plan (e.g. Free-tier restaurants should see "Your plan doesn't include automatic notifications"). Toggle to "Use my own WhatsApp Business API," confirm the token/phone-number-ID fields and template text appear, and that "Save changes" is disabled until both fields are filled. Since `whatsapp_settings` doesn't exist on the live project yet (Task 1 unapplied), actually clicking "Save changes" is expected to fail with a table-not-found error surfaced via the existing `error` state — confirm it shows a clean inline error, not a crash, and report this as the expected, current-state result.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/whatsapp-settings-form.tsx app/dashboard/settings/page.tsx
git commit -m "feat: add WhatsApp notification settings UI to dashboard Settings"
```

---

### Task 8: Admin panel usage visibility

**Files:**
- Modify: `app/admin/page.tsx` (currently 60 lines)
- Modify: `components/admin/tenant-table.tsx` (currently 133 lines)

**Interfaces:**
- Consumes: `beirutStartOfMonth` (Task 2).
- Produces: `TenantTable` takes a new `whatsappUsageByRestaurant: Record<string, number>` prop; `ManageTenantForm` (defined in the same file) takes and renders a new `whatsappMessagesThisMonth: number` prop.

- [ ] **Step 1: Fetch this month's usage per restaurant**

Read the actual current `app/admin/page.tsx` first and compare to the "before" block below.

Replace:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow, mapSubscriptionRow } from "@/lib/supabase/mappers";
import { TenantTable } from "@/components/admin/tenant-table";
```

with:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow, mapSubscriptionRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";
import { TenantTable } from "@/components/admin/tenant-table";
```

Replace:

```tsx
  const [{ data: restaurantRows, error: restaurantsError }, { data: subscriptionRows, error: subscriptionsError }] =
    await Promise.all([
      supabase.from("restaurants").select("*").order("name"),
      supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
    ]);

  if (restaurantsError || subscriptionsError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load tenants: {restaurantsError?.message ?? subscriptionsError?.message}
      </p>
    );
  }

  const restaurants = (restaurantRows ?? []).map(mapRestaurantRow);
  const subscriptions = (subscriptionRows ?? []).map(mapSubscriptionRow);

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Restaurants</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        All tenants on the platform. Manage plan, billing status, and payment confirmation.
      </p>
      <TenantTable initialRestaurants={restaurants} initialSubscriptions={subscriptions} />
    </div>
  );
}
```

with:

```tsx
  const startOfMonthISO = beirutStartOfMonth(new Date()).toISOString();

  const [
    { data: restaurantRows, error: restaurantsError },
    { data: subscriptionRows, error: subscriptionsError },
    { data: whatsappLogRows },
  ] = await Promise.all([
    supabase.from("restaurants").select("*").order("name"),
    supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
    supabase.from("whatsapp_message_log").select("restaurant_id").eq("status", "sent").gte("created_at", startOfMonthISO),
  ]);

  if (restaurantsError || subscriptionsError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load tenants: {restaurantsError?.message ?? subscriptionsError?.message}
      </p>
    );
  }

  const restaurants = (restaurantRows ?? []).map(mapRestaurantRow);
  const subscriptions = (subscriptionRows ?? []).map(mapSubscriptionRow);

  const whatsappUsageByRestaurant: Record<string, number> = {};
  for (const row of whatsappLogRows ?? []) {
    const id = row.restaurant_id as string;
    whatsappUsageByRestaurant[id] = (whatsappUsageByRestaurant[id] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Restaurants</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        All tenants on the platform. Manage plan, billing status, and payment confirmation.
      </p>
      <TenantTable
        initialRestaurants={restaurants}
        initialSubscriptions={subscriptions}
        whatsappUsageByRestaurant={whatsappUsageByRestaurant}
      />
    </div>
  );
}
```

Note: `whatsappLogRows` is deliberately not part of the earlier `if (restaurantsError || subscriptionsError)` error check — `whatsapp_message_log` won't exist until Task 1's migration is applied, and that must not block the rest of `/admin` from working; an error here just leaves `whatsappLogRows` `null`, and the loop below already handles that via `?? []`.

- [ ] **Step 2: Thread the prop through `TenantTable` and render it in `ManageTenantForm`**

Read the actual current `components/admin/tenant-table.tsx` first and compare to the "before" blocks below.

Replace:

```tsx
export function TenantTable({
  initialRestaurants,
  initialSubscriptions,
}: {
  initialRestaurants: Restaurant[];
  initialSubscriptions: Subscription[];
}) {
```

with:

```tsx
export function TenantTable({
  initialRestaurants,
  initialSubscriptions,
  whatsappUsageByRestaurant,
}: {
  initialRestaurants: Restaurant[];
  initialSubscriptions: Subscription[];
  whatsappUsageByRestaurant: Record<string, number>;
}) {
```

Replace:

```tsx
          {managing && (
            <ManageTenantForm
              restaurant={managing}
              subscription={managingSub}
              onPlanStatusSaved={handlePlanStatusSaved}
              onPaymentRecorded={handlePaymentRecorded}
              onClose={() => setManagingId(null)}
            />
          )}
```

with:

```tsx
          {managing && (
            <ManageTenantForm
              restaurant={managing}
              subscription={managingSub}
              whatsappMessagesThisMonth={whatsappUsageByRestaurant[managing.id] ?? 0}
              onPlanStatusSaved={handlePlanStatusSaved}
              onPaymentRecorded={handlePaymentRecorded}
              onClose={() => setManagingId(null)}
            />
          )}
```

Replace:

```tsx
function ManageTenantForm({
  restaurant,
  subscription,
  onPlanStatusSaved,
  onPaymentRecorded,
  onClose,
}: {
  restaurant: Restaurant;
  subscription: Subscription | null;
  onPlanStatusSaved: (updated: Restaurant) => void;
  onPaymentRecorded: (inserted: Subscription) => void;
  onClose: () => void;
}) {
```

with:

```tsx
function ManageTenantForm({
  restaurant,
  subscription,
  whatsappMessagesThisMonth,
  onPlanStatusSaved,
  onPaymentRecorded,
  onClose,
}: {
  restaurant: Restaurant;
  subscription: Subscription | null;
  whatsappMessagesThisMonth: number;
  onPlanStatusSaved: (updated: Restaurant) => void;
  onPaymentRecorded: (inserted: Subscription) => void;
  onClose: () => void;
}) {
```

Replace:

```tsx
          <div className="flex items-center justify-between">
            <Button size="sm" onClick={savePlanStatus} disabled={planSaving}>
              {planSaving ? "Saving…" : "Update plan & status"}
            </Button>
            {planSaved && <p className="text-sm text-success">Saved.</p>}
          </div>
          {planError && <p className="text-sm text-destructive">{planError}</p>}
        </div>
```

with:

```tsx
          <div className="flex items-center justify-between">
            <Button size="sm" onClick={savePlanStatus} disabled={planSaving}>
              {planSaving ? "Saving…" : "Update plan & status"}
            </Button>
            {planSaved && <p className="text-sm text-success">Saved.</p>}
          </div>
          {planError && <p className="text-sm text-destructive">{planError}</p>}
          <p className="text-xs text-muted-foreground">WhatsApp messages this month: {whatsappMessagesThisMonth}</p>
        </div>
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Live manual verification**

Run `npm run dev`, log in as a real platform admin, open `/admin`, click "Manage" on any tenant. Confirm the "WhatsApp messages this month: 0" line renders in the sheet (0 is correct — `whatsapp_message_log` doesn't exist on the live project yet, so the count safely defaults to zero for every tenant, per Step 1's note).

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx components/admin/tenant-table.tsx
git commit -m "feat: show WhatsApp Cloud API usage per tenant in the admin panel"
```

---

### Task 9: Update `SETUP_TODO.md` and `README.md`

**Files:**
- Modify: `SETUP_TODO.md` (currently 125 lines)
- Modify: `README.md` (currently 108 lines)

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Replace `SETUP_TODO.md`'s WhatsApp section**

The section currently reads (under `## 2. WhatsApp order notifications`):

```md
## 2. WhatsApp order notifications

The app already works today via a `wa.me` deep link (see `lib/whatsapp.ts`) —
no approval needed, orders open pre-filled in the customer's own WhatsApp.

To upgrade to fully automatic notifications (no customer action required):

1. Create a Meta Business account and a WhatsApp Business app.
2. Go through Meta's business verification (this has a lead time — start
   early).
3. Get a permanent access token and phone number ID, add them to `.env.local`.
4. Replace the `wa.me` link flow with a server route that calls the WhatsApp
   Cloud API directly.
```

Replace with:

```md
## 2. WhatsApp order notifications

The app already works today via a `wa.me` deep link (see `lib/whatsapp.ts`) —
no approval needed, orders open pre-filled in the customer's own WhatsApp.
The code for fully automatic Cloud API notifications is now built (see
`docs/superpowers/specs/2026-08-17-whatsapp-cloud-api-design.md`) — the deep
link stays as the automatic fallback whenever Cloud API isn't set up, is
over its monthly cap, or fails. These steps are what's left for you:

1. Paste and run `supabase/sql/08_whatsapp.sql` in Supabase Studio's SQL
   Editor — adds the `whatsapp_settings` and `whatsapp_message_log` tables
   this feature depends on.
2. Create a Meta Business account and a WhatsApp Business app for Tlabli's
   own shared number.
3. Go through Meta's business verification (this has a lead time — start
   early).
4. Get a permanent access token and phone number ID, add them to
   `WHATSAPP_CLOUD_API_TOKEN` / `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID` in
   `.env.local` (already scaffolded in `.env.example`).
5. Submit this exact message template for Meta's approval on Tlabli's
   WhatsApp Business Account (required for any business-initiated message —
   restaurants never message Tlabli's number first, so there's no open
   session to send free-form text into):
   - Name: `new_order_notification`
   - Category: `UTILITY`
   - Language: `en`
   - Body: `🔔 New order at {{1}}` / (blank line) / `{{2}}` / (blank line) /
     `Total: {{3}}` / `Customer: {{4}}` / `{{5}}`
6. Restaurants can instead bring their own Meta Business API credentials
   (unmetered, since Meta bills them directly instead of Tlabli) via a new
   "WhatsApp notifications" card in their own `/dashboard/settings` — each
   one needs the same template approved on their own WhatsApp Business
   Account before their notifications will send.
7. Tlabli's shared number is capped per plan to control Meta's per-message
   cost to you: Free 0/month (deep link only), Basic 20/month, Pro
   50/month, Custom unlimited. Usage per tenant is visible in `/admin` —
   billing for actual usage stays a manual decision, same as every other
   subscription charge today.
```

- [ ] **Step 2: Update `README.md`'s "Getting started" note and "Known limitations"**

The "Status" section's last sentence currently reads:

```md
See `SETUP_TODO.md` for the remaining steps (WhatsApp Cloud API, a
domain) before this is fully live for real customers.
```

Leave this line as-is (still accurate — WhatsApp Cloud API remains a `SETUP_TODO.md` step, just now code-complete rather than "not started").

Add a new bullet at the end of the "Known limitations" section (after the "No rate-limiting on order creation" bullet):

```md
- WhatsApp Cloud API notifications are fully built (`lib/whatsapp-cloud-api.ts`)
  but not yet live — `WHATSAPP_CLOUD_API_TOKEN`/`WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`
  are unset and `supabase/sql/08_whatsapp.sql` hasn't been applied yet (see
  SETUP_TODO.md item 2). Every checkout currently falls back to the `wa.me`
  deep link, which is the correct, safe behavior for this state — not a bug.
```

- [ ] **Step 3: Commit**

```bash
git add SETUP_TODO.md README.md
git commit -m "docs: document WhatsApp Cloud API setup steps in SETUP_TODO and README"
```

---

### Task 10: Final build verification and live smoke test

**Files:**
- None created or modified — this task only verifies.

**Interfaces:**
- None.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with no errors, all previously-existing routes still present, no new routes (this sub-project adds no new pages, only new components/actions/lib code and a new card on the existing `/dashboard/settings` page).

- [ ] **Step 2: Full live smoke test**

Run `npm run dev` with a real owner login available:

1. `/dashboard/settings` shows the new "WhatsApp notifications" card with the correct cap message for that restaurant's plan.
2. Toggling to "Use my own WhatsApp Business API" shows the token/phone-number-ID fields and the exact template text from Task 9.
3. A storefront checkout still opens the `wa.me` deep link exactly as before this sub-project (expected, since Cloud API genuinely isn't configured yet) — confirm no console errors, no crash, order still completes.
4. `/admin`'s tenant "Manage" sheet shows "WhatsApp messages this month: 0" for every tenant.
5. If the user has since applied `08_whatsapp.sql` and configured real Meta credentials (this may not be true at the time this task runs — report clearly either way): place a real order for a Basic/Pro-plan restaurant on `'tlabli'` mode and confirm a real message log row is written with `status = 'sent'` or `'failed'` (whichever actually happened), and that the deep link did NOT also open when `getWhatsAppCloudApiAvailability` returned `true`.

Report exactly which of these 5 steps could be run live versus which depend on setup steps only the user can complete, per this plan's Global Constraints.

- [ ] **Step 3: No commit** — this task is verification-only, nothing to add.

## Self-Review Notes

- **Spec coverage:** Task 1 covers the data model (Section 1 of the design). Task 2 covers the shared type/mapper/date-helper groundwork. Task 3 covers the Cloud API module + template (Section 2), including the critical "both functions check configuration identically" property called out in Global Constraints. Task 4 covers the settings Server Action. Task 5 covers wiring `createOrder`. Task 6 covers the client/server coordination for the deep-link decision (the trickiest section of the design). Task 7 covers the Settings UI. Task 8 covers admin visibility. Task 9 covers docs. Task 10 covers the design's verification-approach section end-to-end.
- **Placeholder scan:** no TBD/TODO; every step has complete, literal code.
- **Type consistency:** `WhatsAppSettings` (Task 2) is imported with identical field names (`restaurantId`, `mode`, `ownAccessToken`, `ownPhoneNumberId`) in Tasks 3, 4, 7. `getWhatsAppCloudApiAvailability(restaurantId, planId)` and `sendWhatsAppCloudApiNotification(restaurantId, orderId, order)` (Task 3) are called with these exact names and argument orders in Tasks 5 and 6. `whatsappCloudApiAvailable` is threaded with an identical name and boolean type through `app/[restaurantSlug]/page.tsx` → `TemplateRenderer` → all four templates → `CartDrawer` in Task 6 — no renaming across that chain. `whatsappUsageByRestaurant`/`whatsappMessagesThisMonth` (Task 8) match between `app/admin/page.tsx`, `TenantTable`, and `ManageTenantForm`.
- **Caught during self-review:** the design's Section 2 module sketch took `restaurantName`/`restaurantWhatsappNumber`/`planId` as direct parameters to `sendWhatsAppCloudApiNotification`, which would have meant trusting client-supplied values (from `CreateOrderInput`) for a cap/credential decision. Task 3's actual signature instead only takes `restaurantId` + `orderId` + the order line-item data, and fetches the restaurant's name/WhatsApp number/plan itself via the admin client — more robust (never trusts the client for anything security- or billing-relevant) and needs no new props threaded through `CartDrawer`/the templates for the send path (only the availability *check* path needs the new boolean prop, in Task 6).
