# Setup TODO — actions that need you, not code

This app is fully built and running on **mock/demo data** — the marketing site,
all 4 menu templates, the owner dashboard, onboarding, and order tracking all
work end-to-end in preview mode. Nothing here is broken; these are the steps
that genuinely require your accounts, approvals, or decisions before the app
can run against a real database and send real WhatsApp orders.

## 1. Create the Supabase project (required to go live)

1. Create a free project at supabase.com.
2. Open the SQL Editor and run these five files, in order, pasting each
   one's full contents and clicking Run before moving to the next:
   `supabase/sql/01_schema.sql`, `supabase/sql/02_rls.sql`,
   `supabase/sql/03_storage.sql`, `supabase/sql/04_seed.sql`,
   `supabase/sql/05_auth.sql`. Together they create all 9 tables (matching
   `lib/types.ts` / `PROJECT_INSTRUCTIONS.md` section 7), enable Row-Level
   Security with the right policies, create the `menu-photos` storage
   bucket, seed the same 4 demo restaurants `lib/mock-data.ts` already
   shows, and add the signup bootstrap RPC that onboarding calls.
3. Copy the project URL and anon key into `.env.local` (see `.env.example`),
   and set `PLATFORM_ADMIN_EMAILS` to your own email (comma-separated if
   more than one) so `/admin` recognizes you once you log in. This is only
   half of admin setup — also see step 8 below.
4. In your Supabase project, go to Authentication → Providers → Email and
   turn off "Confirm email." With it on, `supabase.auth.signUp()` won't
   return a session until the user clicks a confirmation link, and the
   signup flow (`/onboarding` step 4) needs a session immediately to create
   the restaurant — leaving a real customer stuck. Turning this off matches
   why email+password was chosen over magic link in the first place
   (avoiding an email-checking step).
5. `npm install` (already run for you if you're reading this after the auth
   sub-project's implementation — otherwise this installs
   `@supabase/supabase-js` and `@supabase/ssr`).
6. Real login/signup now works: visit `/onboarding` to create your first
   real restaurant + owner account, or run
   `node --env-file=.env.local scripts/seed-staff-logins.mjs` (after also
   filling in `SUPABASE_SERVICE_ROLE_KEY`) to create real logins for the 7
   demo staff members already seeded in `04_seed.sql` — that script prints
   each email and the shared demo password when it finishes.
7. Also paste and run `supabase/sql/06_orders.sql` — adds the `create_order`
   RPC that storefront checkout calls to write real orders with a race-free
   per-restaurant queue number.
8. Also paste and run `supabase/sql/07_admin.sql` — adds the `platform_admins`
   table and `is_platform_admin()` RLS policies that let `/admin` read and
   manage every tenant. Then, in Supabase Studio's Table Editor, add one row
   to `platform_admins` for **every** email already in `PLATFORM_ADMIN_EMAILS`
   (see step 3) — these are two independent lists that must be kept in sync
   by hand: the env var controls who can *reach* `/admin` at all, this table
   controls what an authenticated request can actually read or write once
   there. If you skip this, `/admin` will load a "not fully set up as a
   platform admin yet" message instead of the tenant list.
9. `/dashboard` (menu, orders, analytics, settings, team), the storefront
   (menu display, checkout, order tracking), and `/admin` (every tenant's
   plan, status, and billing history) now read and write this real database —
   nothing left reads `lib/mock-data.ts`.
10. Enable Realtime for the `orders` table so the dashboard's kitchen queue
   updates live without a reload: in Supabase Studio, go to Database →
   Replication, and toggle on the `orders` table under the `supabase_realtime`
   publication (or run `ALTER PUBLICATION supabase_realtime ADD TABLE orders;`
   in the SQL Editor). Without this, order status changes and new orders still
   work correctly — the dashboard just needs a manual reload to show them.

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

## 3. Domain & hosting

1. Buy a domain (e.g. tlabli.com) and connect it to a Vercel project.
2. Set `NEXT_PUBLIC_SITE_URL` in your production environment.
3. Add your Supabase Storage hostname to `next.config.mjs` under
   `images.remotePatterns` once photo uploads are live.
4. `/admin` is now gated behind real login plus the `PLATFORM_ADMIN_EMAILS`
   allowlist (see section 1) and the `platform_admins` table/RLS policies
   (see section 1, step 8) — double-check both lists only contain emails you
   actually trust before you connect a real domain, since together they're
   what stands between the public internet and every tenant's billing data.

## 4. Collecting your own subscription payments

Per the pricing model in `PROJECT_INSTRUCTIONS.md`, billing is manual:

1. Set up an OMT and/or Whish Money account to receive owner payments.
2. Use the `/admin` panel to record payment confirmations and activate
   accounts — this is real now (see section 1, step 8); the panel itself is
   gated behind real login plus the `PLATFORM_ADMIN_EMAILS`/`platform_admins`
   allowlist (see section 3).

## 5. Content

1. Real logo/wordmark (the current header uses a plain "T" monogram).
2. Decide whether to keep the CSS/icon-based item placeholders (the current
   approach — see `components/storefront/food-image-placeholder.tsx`) as the
   permanent "no photo yet" state, since real menus should show each owner's
   own food photos, not stock images.

## What's already done

- Full Next.js + Tailwind app, 4 distinct menu templates (Fast Food, Bakery,
  Fine Dining, Café), owner dashboard (menu builder, kitchen order queue,
  analytics, settings), onboarding wizard, customer order tracking page.
- Dual currency ($ / L.L.) display throughout.
- Arabic (RTL), English, and French storefront language switching.
- Per-item availability toggle + time-window scheduling.
- Platform admin panel (`/admin`) for managing tenant plan/status/billing —
  real, cross-tenant Supabase data, gated behind real login, the
  `PLATFORM_ADMIN_EMAILS` allowlist, and RLS (`platform_admins` /
  `is_platform_admin()`) — and per-restaurant team/staff role management in
  Settings.
- Real login (`/login`), signup (`/onboarding`), and logout — `/dashboard`
  and `/admin` are gated behind an authenticated session via `middleware.ts`,
  and both now read and write real Supabase data for every logged-in user.
- Design system documented in `design-system/tlabli/MASTER.md`.
