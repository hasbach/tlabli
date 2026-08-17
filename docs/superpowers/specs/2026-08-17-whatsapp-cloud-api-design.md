# WhatsApp Cloud API Notifications — Design

Date: 2026-08-17
Status: Approved

## Context

This is SETUP_TODO.md item 2 — "WhatsApp order notifications." Today, checkout builds a `wa.me` deep link (`lib/whatsapp.ts`) and opens it unconditionally in the customer's own WhatsApp right before the order write (`components/storefront/cart-drawer.tsx`, wired in the owner-data-wiring sub-project's Task 10) — no Meta approval needed, but it depends on the customer actually sending the pre-filled message. This sub-project adds the "fully automatic, no customer action required" upgrade path from `.env.example`'s already-scaffolded `WHATSAPP_CLOUD_API_TOKEN`/`WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`, while keeping the deep link as a fallback for restaurants that don't have (or don't want) a Cloud API set up.

Two things came out of brainstorming that shaped this beyond "just call the Cloud API":

1. **Cost.** Meta charges per business-initiated conversation (roughly $0.03/message in Lebanon, per the approved design conversation). A restaurant paying $6/month on a low tier generating high order volume on a platform-wide number would cost the platform operator more in Meta fees than the subscription earns. So restaurants get a choice: use Tlabli's shared number (metered, capped by plan) or bring their own Meta Business API credentials (unmetered from Tlabli's perspective — Meta bills them directly).
2. **Billing stays manual.** Every subscription/payment in this app today is a human process (owner pays via OMT/Whish, admin activates the plan by hand — see `components/dashboard/settings-form.tsx`'s existing copy). This sub-project tracks usage and enforces a hard cap per plan (auto-falling-back to the deep link once exceeded), but does not compute charges or touch the `subscriptions` table — that stays a decision the platform operator makes by hand, now backed by real usage data instead of guesswork.

## Architecture

**Two new tables**, both **staff-only RLS with no public/anonymous read policy** — unlike `restaurants`/`menu_*`, this data includes a real access token and must never be reachable with just the public anon key (which is not a secret; it ships in the client bundle):

- **`whatsapp_settings`** — at most one row per restaurant, created only when a restaurant explicitly configures something: `restaurant_id` (unique), `mode` (`'tlabli' | 'own'`, default behavior when no row exists is `'tlabli'`), `own_access_token`, `own_phone_number_id`. RLS: `staff manage whatsapp_settings` using `is_staff_of()`, matching the existing `drivers`/`promo_codes` pattern — no anonymous policy.
- **`whatsapp_message_log`** — one row per Cloud API send *attempt*: `restaurant_id`, `order_id`, `created_at`, `status` (`'sent' | 'failed' | 'skipped_over_cap' | 'skipped_not_configured'`), `error_message`. RLS: staff read their own rows; a platform-admin read policy (extending `07_admin.sql`'s pattern) so usage is visible across every tenant in `/admin`. Insert policy is `anyone insert with check (true)`, matching how `orders` already accepts anonymous inserts from checkout — the log holds no secret, only metadata, so this is safe.

**Consequence:** checkout is anonymous (no session), but `createOrder` still needs to read `whatsapp_settings` (which credentials to use) and count `whatsapp_message_log` (cap check). There is no RLS policy that could safely let an anonymous checkout read these without also letting anyone with the public anon key read every restaurant's token directly via the REST API. So this one read goes through the **service-role client** (`lib/supabase/admin.ts`) — the same reasoning that put `addStaffMember` there. This is the second, narrow, deliberate use of the service-role client in this codebase.

## The Cloud API module

**New file `lib/whatsapp-cloud-api.ts`**, two exports:

- **`getWhatsAppCloudApiAvailability(restaurantId, planId): Promise<boolean>`** — called from `app/[restaurantSlug]/page.tsx` at render time (service-role client). `true` unconditionally for `mode='own'` with both credentials set; for `mode='tlabli'` (or no row), `true` only if this month's `'sent'` count is under the plan's cap. Plan caps: Free 0, Basic 20, Pro 50, Custom unlimited.
- **`sendWhatsAppCloudApiNotification(restaurantId, planId, order, restaurantName): Promise<{ sent: boolean }>`** — called from `createOrder` after the order row exists (service-role client). Re-checks the cap authoritatively (the storefront's earlier boolean is only a client-side hint), resolves credentials (platform env vars for `'tlabli'`, the restaurant's own row for `'own'`), calls Meta's Cloud API with a 5-second timeout (`AbortSignal.timeout(5000)`), writes exactly one `whatsapp_message_log` row regardless of outcome, and **never throws** — every failure path is caught and logged, matching the resilience rule already established for the order write itself (a Supabase outage must never block a customer's order; a WhatsApp outage must never block it either).

**Message template.** WhatsApp Cloud API requires a pre-approved template for any business-initiated message (there is no prior inbound message from the customer to open a free-form session) — true for both Tlabli's number and every BYO restaurant's own WhatsApp Business Account. One canonical template, mirroring `buildWhatsAppOrderMessage`'s existing line structure so the notification reads the same regardless of channel:

- Name: `new_order_notification`, category `UTILITY`, language `en`.
- Body: `🔔 New order at {{1}}\n\n{{2}}\n\nTotal: {{3}}\nCustomer: {{4}}\n{{5}}`
  — `{{1}}` restaurant name, `{{2}}` itemized order lines, `{{3}}` formatted total, `{{4}}` customer name + phone, `{{5}}` fulfillment detail (table number / delivery address / "Pickup").

This exact text goes into `SETUP_TODO.md` (for Tlabli's own number) and into the BYO settings UI (for restaurant owners to submit on theirs).

## Settings UI & admin visibility

**New component `components/dashboard/whatsapp-settings-form.tsx`**, a new card in `/dashboard/settings` alongside the existing profile/currency/plan cards:

- Toggle: "Use Tlabli's WhatsApp number" (default) vs. "Use my own WhatsApp Business API."
- `'tlabli'` mode: shows this month's usage against the plan's cap (e.g. "12 / 20 messages used this month — falls back to a WhatsApp deep link after that").
- `'own'` mode: Access Token + Phone Number ID fields, plus the template text from above and a note that Cloud API notifications won't work until their own template is Meta-approved. No live credential validation/test-send in this pass (YAGNI) — a bad credential surfaces via the ordinary `'failed'` log path on the first real order.
- **New `lib/actions/whatsapp-actions.ts`** — `updateWhatsAppSettings(restaurantId, patch)`, one Server Action, `{ error } | { data }` contract, using the ordinary RLS-scoped client (the owner is writing their own row here, not reading during anonymous checkout, so no service-role client is needed for this write).

**Admin visibility** (`/admin`'s tenant table / manage-tenant sheet): a read-only "WhatsApp messages this month" stat per tenant, backed by the new platform-admin RLS policy on `whatsapp_message_log`. No charge calculation or billing UI — this is the number the platform operator looks at before deciding what to invoice, matching the "track usage, bill manually" scope.

## Client/server coordination (the deep-link decision)

The trickiest interaction: today, `cart-drawer.tsx`'s `window.open(waLink)` fires synchronously, before any `await`, specifically so browsers don't block it as an unsolicited popup once real async work (network calls) has happened. Cloud API's outcome is only known after `createOrder` resolves — too late to make that call safely.

Resolution: `app/[restaurantSlug]/page.tsx` computes `whatsappCloudApiAvailable` once at render (via `getWhatsAppCloudApiAvailability`) and passes it to `CartDrawer` as a prop. The existing synchronous `window.open(waLink)` call becomes conditional on `!whatsappCloudApiAvailable` — still fully synchronous, still fires (or doesn't) before any network round trip. If `createOrder` itself fails outright (Supabase outage, `06_orders.sql` not applied), the deep link has already opened regardless, since that decision never depended on `createOrder`'s outcome — preserving the existing "a backend failure never blocks the customer's own notification" guarantee.

**Accepted edge case:** the availability flag is computed once per page load, not once per order. A rapid burst of orders right at the cap boundary in one browsing session could get one order near the edge *both* a deep link and a Cloud API send — a harmless duplicate, never a silently missing notification (which is the failure mode that actually matters).

## Error handling

Every skip/failure path is resolved inside `sendWhatsAppCloudApiNotification` by never attempting a doomed request, and logging why:

- Over cap (`'tlabli'` mode) → `status: 'skipped_over_cap'`, no Meta call made.
- `'own'` mode with a blank/missing token or phone-number-ID → `status: 'skipped_not_configured'`, no Meta call made.
- Meta call attempted but fails (timeout, network error, 4xx/5xx — e.g. an unapproved template) → `status: 'failed'`, `error_message` set.
- Success → `status: 'sent'`, counts toward the current month's `'tlabli'`-mode cap.

## Verification approach

No automated test framework in this repo (established convention) — verification is `npm run build` plus manual/live testing against the real, connected Supabase project.

**Fully live-testable without real Meta credentials:** the new migration (read-through only, same as every prior SQL task — cannot be applied by any task in this plan); the Settings UI (mode toggle, BYO fields, usage stat); cap logic (seed `whatsapp_message_log` rows directly, confirm the availability flag and deep-link fallback flip correctly); the `'skipped_*'`/`'failed'` paths (today's actual state — the platform env vars are unset — should produce clean skip/fail logging and a normal deep-link fallback, no crash, no blocked checkout); `/admin`'s new usage stat rendering real data.

**Not fully verifiable without your own Meta Business setup** (same lead-time caveat SETUP_TODO.md already documents for this exact item): an actual successful Cloud API send, and whether the template text above is accepted by Meta's approval process. The HTTP call itself will be built and verified by careful reading against Meta's documented Send Message API request shape, not by a live successful send.

## Docs

- `SETUP_TODO.md`: replace item 2 with the new migration step, the exact template text to submit for approval, and where to set the platform-wide env vars (already scaffolded in `.env.example`).
- `README.md`: update the WhatsApp-related "Known limitations" bullet to reflect the new capability and its manual-Meta-setup dependency.

## Explicitly out of scope

- **Automatic billing/charging** for Cloud API usage — tracked and visible in `/admin`, never charged automatically. A dedicated billing sub-project, not this one.
- **Live BYO credential validation** (a "send test message" button) — a bad credential surfaces via the ordinary failure-logging path on the restaurant's first real order.
- **Multi-language templates** — the notification template is English-only in this pass, matching the dashboard's own English-only UI; the customer-facing deep-link message (`buildWhatsAppOrderMessage`) is untouched and unaffected.
- **Adjustable caps per restaurant** — caps are fixed per plan (`planId`) in code, not configurable per tenant in this pass. Changing a restaurant's plan (already supported via `/admin`) is the only lever.
- **Retrying failed sends** — a failed or timed-out Cloud API attempt is logged and dropped; there is no retry queue. The customer already has the deep-link fallback for that specific order in the cases where it matters (over cap / not configured); a transient Meta-side failure on an otherwise-configured, under-cap restaurant is the one gap this leaves — accepted for this pass, matching the general appetite for the simplest thing that works.
