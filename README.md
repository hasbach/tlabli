# Tlabli

Digital menus and WhatsApp ordering for Lebanese restaurants, snack shops,
bakeries, and cafés — built for owners with no time, no dev team, and no big
budget. See `PROJECT_INSTRUCTIONS.md` for the full product plan and market
research this app is built from.

## Status

Fully built frontend running on **mock data** — nothing here needs a backend
to try. See `SETUP_TODO.md` for the handful of steps (Supabase, WhatsApp
Cloud API, a domain) that need real accounts before this goes live for real
customers.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + hand-rolled shadcn-style
components + Radix UI primitives + Recharts. No backend wired up yet — see
`lib/mock-data.ts` and the `// TODO(supabase):` comments throughout for
exactly where real data will plug in.

## Getting started

```bash
npm install
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
  supabase/client.ts        Inert stub until Supabase is connected
design-system/tlabli/       Design tokens & rationale from the ui-ux-pro-max research
```

## Design system

Colors, typography, and per-template theming decisions are documented in
`design-system/tlabli/MASTER.md`. Each menu template applies its own CSS
variable overrides (see `.theme-*` classes in `app/globals.css`) so Fast Food,
Bakery, Fine Dining, and Café each feel distinct while sharing the same
components.

## Known limitations (by design, for now)

- No real database — every write (adding a menu item, advancing an order,
  saving settings) only updates in-memory React state and resets on reload.
- No real authentication — `/dashboard` isn't gated behind a login yet.
- Menu item photos are CSS/icon placeholders, not real photos — see
  `SETUP_TODO.md` item 5 for why that's actually correct for now.
