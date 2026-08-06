# Project Instructions — Lebanon Restaurant Digital Menu SaaS

## 1. Product Summary

A self-serve SaaS that lets a Lebanese restaurant, snack shop, fast food spot, or home bakery owner build a professional online menu with ordering in minutes, with no design skills, no dev team, and minimal budget. Owner picks a business type, picks a template, adds items, and gets a shareable menu link + QR code that customers can browse, order from, and pay/arrange for — with new orders landing directly in the owner's WhatsApp.

**Primary persona:** a Lebanese F&B micro/small business owner (1–10 staff), phone-first, already runs the business informally through WhatsApp/Instagram, price-sensitive, distrustful of anything requiring a foreign credit card, needs both USD and LBP shown because that's how customers actually pay.

## 2. Market Research Summary (Lebanon)

- **Economy:** Lebanon has been in a currency crisis since 2019; the LBP has lost the large majority of its value, and the economy now runs on de facto dual-currency pricing (USD for real value, LBP for small cash/change). ~785 restaurants and cafés closed in the first crisis wave (Sept 2019–Feb 2020, ~25,000 jobs lost), which shows how thin margins are for this sector — a cheap, high-leverage tool matters more than a feature-rich, expensive one.
- **Connectivity:** Internet penetration is high (~90%+), mobile penetration ~80%, and WhatsApp is the de facto national business channel (large enough that a 2019 government attempt to tax WhatsApp calls triggered nationwide protests). Any product that doesn't lean on WhatsApp is fighting the market's actual behavior.
- **Payments:** International card gateways (Stripe/PayPal) are largely impractical for local business owners because of banking capital controls; local money-transfer apps (OMT, Whish Money) and cash dominate. A SaaS billing model that assumes Stripe-only will lock out most of the target market.
- **Competition:** Foodics (Saudi-based) leads the region for full restaurant POS + online ordering, but it targets mid/large restaurants — hardware, integration overhead, and pricing that's overkill for a bakery or falafel stand. Toters is the dominant Lebanese delivery marketplace, but it's a commission-based marketplace (not a branded, owned menu) and commission rates are a known pain point for small owners. Most micro-businesses currently improvise with a Canva PDF menu, an Instagram bio link, or a plain WhatsApp product catalog — all of which go stale fast and can't take structured orders.
- **Direct analog — Menuo.lk (Sri Lanka):** same core concept (digital menu builder + QR + ordering), live in a comparable price-sensitive market. Their Free tier is display-only (menu + QR, no real ordering, ~10 item cap); ordering, unlimited items, and analytics unlock on their paid tier (~$5/month equivalent). They also offer per-item sold-out/time-based availability toggles and a sequential kitchen order queue — both adopted into this plan below (see sections 4 and 6). They do not appear to support dual currency, Arabic/RTL, or WhatsApp-based order relay, which remain our differentiators for Lebanon.
- **The gap:** a cheap, self-serve, Lebanon-tailored "menu in minutes" product built around WhatsApp ordering and honest dual-currency pricing, positioned well below Foodics on cost/complexity and outside the commission structure of marketplaces like Toters.

*Note: live web search was unavailable in the research session that produced this document; figures above come from a small number of directly fetched sources plus general market knowledge, and should be treated as directional rather than precise. Re-validate key stats (restaurant count, current inflation figures, payment app market share) before using them in external-facing materials like a pitch deck.*

## 3. Tech Stack

- **Frontend:** Next.js (App Router), Tailwind CSS, shadcn/ui components. Mobile-first responsive design; RTL layout support for Arabic.
- **Backend/Data:** Supabase (Postgres, Auth, Storage for menu images, Realtime for live order updates).
- **Hosting:** Vercel (frontend) + Supabase Cloud (backend). Low ongoing cost, fits a bootstrapped build.
- **Messaging:** WhatsApp Cloud API (Meta) for automated order notifications once verified; `wa.me` deep links as the fallback/MVP-simplest option for day one.
- **PWA:** Add manifest + service worker so the public menu page is installable and caches for weak-connectivity browsing (common in Lebanon due to power/network instability).
- **i18n:** next-intl (or equivalent) for Arabic / English / French, with Arabic as RTL.

## 4. Core Features (v1 scope — full feature set, no cuts)

### 4.1 Owner-facing (dashboard app)
- **Onboarding:** choose restaurant type (fine dining, fast food/snacks, bakery/small business, café, cloud kitchen — extensible list).
- **Template gallery:** curated menu template per restaurant type (color/layout presets), selectable and later switchable.
- **Menu builder:**
  - Categories (e.g. Starters, Mains, Drinks).
  - Items: image upload, title, description, price, side items/add-ons (with optional extra price), variants (e.g. size/flavor).
  - Currency setting: owner picks display currency ($ or L.L.), with option to show both.
  - **Per-item availability control:** single-click "mark as sold out" toggle per item, plus optional time-based availability scheduling per item (e.g. a lunch special only shows 12:00–15:00). Inspired by Menuo.lk; goes beyond our original whole-restaurant "business hours" to per-dish granularity.
- **Business hours:** set open hours per day; storefront auto-shows "Closed" outside those hours.
- **Promo codes / combo deals:** percentage or fixed-amount discount codes, and bundled combo pricing.
- **Order dashboard:** live incoming orders, order status management (Received → Preparing → Out for delivery/Ready for pickup → Completed).
- **Kitchen order queue:** a sequential, numbered queue view of active orders for kitchen/counter staff (lightweight KDS-style display) — simpler and faster to scan than a plain order list, especially during rush hours. Inspired by Menuo.lk.
- **Analytics dashboard:** order count over time, most-ordered items, total sales, basic revenue trend (day/week/month).
- **Driver management:** assign a driver (name + mobile number) to an order; customer sees this once assigned.
- **Team/staff (basic):** at least one additional login role (e.g. staff can manage orders but not billing/menu).

### 4.2 Customer-facing (public storefront)
- **Menu page:** per-restaurant public link (`/[restaurant-slug]`) and auto-generated QR code for print/table use.
- **Browsing:** categories, item detail (image, description, price, add-ons/variants).
- **Cart & checkout:** add to cart, adjust quantities/add-ons, checkout with name/phone/address (or pickup) and payment/delivery preference note.
- **Order placed:** confirmation screen + a persistent order-tracking link.
- **Order status tracking:** customer can revisit their order link and see current status, and driver name/mobile number once assigned.
- **Repeat order shortcut:** returning customers (matched by phone number, no full account signup required) can quickly reorder a past order.
- **Language toggle:** Arabic (RTL) / English / French.

### 4.3 Order flow (WhatsApp integration)
- New order placed on storefront → structured WhatsApp message sent to the owner's registered WhatsApp number ("🔔 New order at [Restaurant] — [items], total [amount], customer [phone]").
- MVP: triggered via `wa.me` link/click-to-notify flow if Cloud API isn't yet approved; upgrade path to fully automated Cloud API push notification.

### 4.4 Platform admin (you, the SaaS operator)
- **Admin panel:** view all tenant restaurants, subscription status, manually activate/deactivate accounts.
- **Manual billing flow:** owner pays via OMT/Whish/cash → sends payment proof (screenshot/reference) → admin marks account active for the paid period. No card gateway required for v1.
- **Plan/tier assignment:** set each restaurant's plan (see pricing below) and its feature access accordingly.

## 5. Suggested Additions Beyond the Original Brief

- Arabic/English/French language toggle with Arabic RTL — near-mandatory for local trust and usability.
- Business hours with automatic "closed" state on the storefront.
- Promo codes and combo/meal-deal pricing.
- PWA offline caching so the menu still loads on a weak connection.
- Repeat-order shortcut keyed to phone number, avoiding a full customer account system.
- Loyalty stamps (e.g. "order 10, get 1 free") — phase 3.
- Multi-branch support for owners with more than one location — phase 3.
- White-label / custom domain option — phase 3, higher-tier plan.

## 6. Pricing / Monetization (freemium model, billing handled manually)

Restructured from the original trial-only model to a **freemium** structure, following Menuo.lk's approach of a permanently-free display tier that drives adoption, with the revenue-generating feature (real ordering) gated behind a paid plan. Price points are set for Lebanon's budget reality rather than copied from Menuo's Sri Lanka pricing — kept low enough that a single-owner bakery or snack shop can justify it from day one.

| Tier | Price (indicative, USD) | Includes |
|---|---|---|
| Free (forever) | $0 | Digital menu + QR code, up to 15 items, 1 template, dual currency display — **browse-only, no ordering.** Gets owners using the tool and sharing the link before they ever have to pay. |
| Basic | ~$5–7/month | Unlimited items, real ordering unlocked (cart + checkout + WhatsApp order alerts), per-item availability control, order dashboard, kitchen order queue, basic analytics |
| Pro | ~$12–15/month | + driver tracking, promo codes/combos, multi-branch, advanced analytics, priority support |
| Custom/White-label | Negotiated | + custom domain, dedicated onboarding, custom feature requests |

Payment collected via OMT/Whish/cash transfer, confirmed manually through the admin panel (see 4.4). Revisit adding Stripe once there's diaspora/international demand. Validate these exact price points with a handful of target owners before finalizing — Lebanon willingness-to-pay for software is thin and better confirmed than assumed.

## 7. Data Model (high-level)

- `restaurants` (id, name, slug, type, template_id, currency_display, languages, hours, plan_id, status)
- `menu_categories` (id, restaurant_id, name, sort_order)
- `menu_items` (id, category_id, title, description, price, image_url, is_available, available_from, available_until)
- `item_addons` (id, item_id, name, extra_price)
- `orders` (id, restaurant_id, queue_number, customer_phone, customer_name, items_json, total, currency, status, driver_id, created_at)
- `drivers` (id, restaurant_id, name, phone)
- `promo_codes` (id, restaurant_id, code, discount_type, discount_value, active)
- `subscriptions` (id, restaurant_id, plan_id, status, period_start, period_end, payment_proof_ref)
- `staff_users` (id, restaurant_id, auth_user_id, role)

## 8. Roadmap / Phases

**Phase 1 — Foundation**
Auth (Supabase), DB schema, restaurant onboarding flow (type + template selection), base design system, RTL/i18n scaffolding.

**Phase 2 — MVP Launch**
Menu builder (incl. per-item availability control), public storefront + cart/checkout, WhatsApp order notification (wa.me first), owner dashboard with kitchen order queue + basic analytics, admin panel with manual billing activation and free/paid tier gating, QR code generation.

**Phase 3 — Ordering Depth**
Order status tracking end-to-end, driver assignment + tracking info, promo codes/combos, business hours auto-closing, repeat-order shortcut, full Arabic/French i18n polish.

**Phase 4 — Growth Features**
Loyalty stamps, multi-branch support, white-label/custom domains, deeper analytics (peak hours, item profitability), WhatsApp Cloud API full automation (replacing wa.me fallback).

## 9. Non-Functional Requirements

- Mobile-first UI (majority of customers will order from a phone).
- Arabic RTL layout correctness, not just translated strings.
- Resilience to weak/intermittent connectivity (PWA caching, lightweight image delivery).
- Row-level security in Supabase so each restaurant only accesses its own data.
- Regular automated backups of orders/menu data.
- Simple enough onboarding that a non-technical owner can go from signup to a live menu link in under 15 minutes.

## 10. Next Steps

1. Set up Supabase project + Next.js repo scaffold per section 3.
2. Build DB schema per section 7 with row-level security policies.
3. Build Phase 1 (onboarding + template selection) and Phase 2 (MVP) per section 8.
4. Validate WhatsApp Cloud API business verification process early (it has approval lead time) while shipping wa.me as the interim path.
5. Re-validate the market figures in section 2 with live sources before using them externally (e.g. in a pitch deck or investor conversation).
