# Setup TODO — actions that need you, not code

This app is fully built and running on **mock/demo data** — the marketing site,
all 4 menu templates, the owner dashboard, onboarding, and order tracking all
work end-to-end in preview mode. Nothing here is broken; these are the steps
that genuinely require your accounts, approvals, or decisions before the app
can run against a real database and send real WhatsApp orders.

## 1. Create the Supabase project (required to go live)

1. Create a free project at supabase.com.
2. In the SQL editor, create tables matching `lib/types.ts` — the shapes there
   mirror `PROJECT_INSTRUCTIONS.md` section 7 exactly: `restaurants`,
   `menu_categories`, `menu_items`, `item_addons`, `orders`, `drivers`,
   `promo_codes`, `subscriptions`, `staff_users`.
3. Enable Row-Level Security on every table so each restaurant only reads/writes
   its own rows.
4. Create a Storage bucket (e.g. `menu-photos`) for owner-uploaded item photos.
5. Copy the project URL and anon key into `.env.local` (see `.env.example`).
6. Run `npm install @supabase/supabase-js` and uncomment the client in
   `lib/supabase/client.ts`.
7. Swap the mock reads in `lib/mock-data.ts` / `lib/menu.ts` for real Supabase
   queries — every place that needs this is marked with a
   `// TODO(supabase):` comment.

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

## 4. Collecting your own subscription payments

Per the pricing model in `PROJECT_INSTRUCTIONS.md`, billing is manual:

1. Set up an OMT and/or Whish Money account to receive owner payments.
2. Decide on your manual-activation process (a simple admin panel is listed
   as a later build item — for now, a shared spreadsheet or the Supabase
   table editor works fine at small scale).

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
- Design system documented in `design-system/tlabli/MASTER.md`.
