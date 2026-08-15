# Tlabli

Digital menus and WhatsApp ordering for Lebanese restaurants, snack shops,
bakeries, and cafés — built for owners with no time, no dev team, and no big
budget. See `PROJECT_INSTRUCTIONS.md` for the full product plan and market
research this app is built from.

## Status

Frontend + a live Supabase backend for auth, the owner dashboard, and the
storefront. `/dashboard` (menu builder, orders, analytics, settings, team)
and the storefront (menu display, checkout, order tracking) all read and
write real data scoped to the logged-in owner's own restaurant — no more
`lib/mock-data.ts`. `/login`, `/onboarding`, `/dashboard`, and `/admin` all
require `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to be
set (see `.env.local` / `.env.example`) — without them those routes fail to
build or render. `/admin` itself is still mock data (see Known limitations).
See `SETUP_TODO.md` for the remaining steps (WhatsApp Cloud API, a domain)
before this is fully live for real customers.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + hand-rolled shadcn-style
components + Radix UI primitives + Recharts. Supabase backs auth, the owner
dashboard, and the storefront data layer — all menu, order, analytics,
settings, and team data is real and scoped per restaurant.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — see SETUP_TODO.md item 1
npm run dev
```

Then open http://localhost:3000.

> `npm run build` fetches Google Fonts (Plus Jakarta Sans, Playfair Display SC,
> Fraunces, Cairo) at build time via `next/font/google` — this needs normal
> internet access (works out of the box on Vercel/most CI, just not in fully
> network-locked sandboxes).

## What to look at

- `/` — marketing site
- `/templates` — the 4 menu template gallery
- `/burger-house`, `/sweet-crumbs`, `/le-jardin`, `/cafe-terra` — live template
  previews (Fast Food, Bakery, Fine Dining, Café), each with working cart +
  WhatsApp checkout
- `/onboarding` — restaurant type & template picker wizard
- `/dashboard` — owner dashboard (menu builder, kitchen order queue,
  analytics, settings incl. team/staff roles) — currently shows Burger
  House's demo data
- `/login` — email/password login; `/dashboard` and `/admin` redirect here if you're not signed in
- `/order/o-1001` — customer-facing order status tracking page
- `/admin` — platform admin panel (all tenants, plan/status, manual billing)

## Project structure

```
app/                     Next.js routes (marketing, templates, dashboard, onboarding, order tracking, admin)
components/
  ui/                     Hand-rolled shadcn-style primitives (button, card, sheet, tabs, ...)
  marketing/              Landing page sections
  storefront/             Cart, checkout, menu item card, language switcher, QR code
  templates/              The 4 menu template layouts (fast-food, bakery, fine-dining, cafe)
  dashboard/               Sidebar, stat cards, order queue, menu builder, analytics, settings, team
  admin/                   Platform admin: tenant table + manage-tenant sheet
lib/
  types.ts                Data model (mirrors PROJECT_INSTRUCTIONS.md section 7)
  mock-data.ts             Demo restaurants/menus/orders/subscriptions/staff — swap for Supabase later
  menu.ts                  getMenuSections() — the one function to swap for a real query
  whatsapp.ts              wa.me order message builder
  i18n/                    en/ar/fr dictionaries + locale/RTL provider
  supabase/client.ts        Real browser client (@supabase/ssr) — connected
design-system/tlabli/       Design tokens & rationale from the ui-ux-pro-max research
```

## Design system

Colors, typography, and per-template theming decisions are documented in
`design-system/tlabli/MASTER.md`. Each menu template applies its own CSS
variable overrides (see `.theme-*` classes in `app/globals.css`) so Fast Food,
Bakery, Fine Dining, and Café each feel distinct while sharing the same
components.

## Known limitations (by design, for now)

- `/admin` (the platform admin panel) still shows mock data — every RLS
  policy scopes to a restaurant's own staff, with no cross-tenant read path
  yet for the admin panel; that's a future sub-project.
- No staff self-service invite flow — the owner creates each team member's
  login directly in Settings (email + a temporary password they share with
  that person), rather than sending an invite link.
- Menu item photos are CSS/icon placeholders, not real photos — see
  `SETUP_TODO.md` item 5 for why that's actually correct for now.
- No rate-limiting on order creation — a very small, unhandled
  business-logic edge case (not a security bug; RLS still scopes correctly),
  acceptable for now.
