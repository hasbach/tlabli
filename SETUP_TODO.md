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
   more than one) so `/admin` recognizes you once you log in.
4. `npm install` (already run for you if you're reading this after the auth
   sub-project's implementation — otherwise this installs
   `@supabase/supabase-js` and `@supabase/ssr`).
5. Real login/signup now works: visit `/onboarding` to create your first
   real restaurant + owner account, or run
   `node --env-file=.env.local scripts/seed-staff-logins.mjs` (after also
   filling in `SUPABASE_SERVICE_ROLE_KEY`) to create real logins for the 7
   demo staff members already seeded in `04_seed.sql` — that script prints
   each email and the shared demo password when it finishes.
6. Swap the mock reads in `lib/mock-data.ts` / `lib/menu.ts` for real Supabase
   queries — every place that needs this is marked with a
   `// TODO(supabase):` comment. `/dashboard`'s displayed data (menu, orders,
   analytics, settings) still shows mock data regardless of who's logged in
   until this happens — that's the next sub-project (owner-side data
   wiring), not this one.

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

## 3. Domain & hosting

1. Buy a domain (e.g. tlabli.com) and connect it to a Vercel project.
2. Set `NEXT_PUBLIC_SITE_URL` in your production environment.
3. Add your Supabase Storage hostname to `next.config.mjs` under
   `images.remotePatterns` once photo uploads are live.
4. `/admin` is now gated behind real login plus the `PLATFORM_ADMIN_EMAILS`
   allowlist (see section 1) — but that allowlist is the only thing standing
   between the public internet and every tenant's billing data once you
   connect a real domain, so double-check it only lists emails you actually
   trust before going live.

## 4. Collecting your own subscription payments

Per the pricing model in `PROJECT_INSTRUCTIONS.md`, billing is manual:

1. Set up an OMT and/or Whish Money account to receive owner payments.
2. Use the `/admin` panel to record payment confirmations and activate
   accounts (mock data only for now — see section 1.6; the panel itself is
   gated behind real login, see section 3).

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
- Platform admin panel (`/admin`) for managing tenant plan/status/billing,
  and per-restaurant team/staff role management in Settings — mock data
  only, but gated behind real login and the `PLATFORM_ADMIN_EMAILS`
  allowlist.
- Real login (`/login`), signup (`/onboarding`), and logout — `/dashboard`
  and `/admin` are gated behind an authenticated session via `middleware.ts`,
  though `/dashboard`'s displayed data still shows mock data regardless of
  who's logged in (see item 1.6 above).
- Design system documented in `design-system/tlabli/MASTER.md`.
