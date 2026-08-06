# Admin Panel + Staff Roles — Design

Date: 2026-08-07
Status: Approved

## Context

`PROJECT_INSTRUCTIONS.md` section 4.4 (Platform admin) and part of section 4.1
(Team/staff) describe two features that have zero code today — no route, no
component, no type. This repo is currently a Next.js frontend running entirely
on mock data (`lib/mock-data.ts`); there is no Supabase connection and no
authentication (`/dashboard` isn't gated behind a login). Every existing
dashboard screen (Settings, Orders, Menu builder) follows the same pattern:
a server component reads from `lib/mock-data.ts` and passes it to a client
component that holds its own `useState`, with changes living only in memory
for the session ("demo only — connect Supabase to persist").

Both features being built here follow that exact convention. Neither can do
real access control yet — there is no logged-in user to restrict. They are
UI + mock-data scaffolding that's ready to wire up once Supabase auth exists,
with `// TODO(supabase):` markers left where a real query/permission check
will eventually go.

## Scope

Two related but independent subsystems, covered in one spec since neither is
large on its own and both share the same mock-data conventions:

1. **Admin panel** — a platform-operator view across all tenants (restaurants):
   subscription status, plan, manual activate/deactivate, payment proof.
2. **Staff roles** — per-restaurant team management for the owner: an
   additional "staff" role that (per the instructions) can manage orders but
   not billing/menu, surfaced as a management UI (no live enforcement).

## Data model additions

`lib/types.ts` gets two new types. `Restaurant.planId` and `Restaurant.status`
remain the single source of truth for a tenant's current plan/status (as they
already are, and as `settings-form.tsx` already reads/writes them) — the new
`Subscription` type only adds billing metadata not yet modeled, avoiding a
duplicate/conflicting copy of plan+status:

```ts
export interface Subscription {
  id: string;
  restaurantId: string;
  periodStart: string;       // ISO date, e.g. "2026-07-01"
  periodEnd: string;         // ISO date
  paymentProofRef?: string;  // OMT/Whish reference note, set by admin
}

export type StaffRole = "owner" | "staff";

export interface StaffUser {
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  role: StaffRole;
}
```

`lib/mock-data.ts` additions:

- `subscriptions: Subscription[]` — one entry per existing mock restaurant
  (`r-fastfood`, `r-bakery`, `r-finedining`, `r-cafe`), with varied
  `periodEnd` dates and at least one with a `paymentProofRef` already set and
  one without, so the admin UI has realistic variety on first load.
- `staffUsers: StaffUser[]` — for `r-fastfood` (the restaurant the owner
  dashboard already shows), seed the owner row plus 1–2 staff rows so the
  Team section isn't empty by default. Other mock restaurants can have just
  an owner row.

## Part 1 — Admin panel

New top-level route, parallel to `/dashboard`, not gated behind login (same
as `/dashboard` today):

- `app/admin/layout.tsx` — minimal shell with its own header, clearly labeled
  "Platform Admin" (distinct styling from the owner-facing dashboard sidebar
  so it visually reads as a different tool for a different audience). No
  sidebar nav — single page for now.
- `app/admin/page.tsx` — server component. Reads `restaurants` and
  `subscriptions` from mock data, passes them to the client table.
- `components/admin/tenant-table.tsx` — client component (`"use client"`),
  holds the interactive state:
  - **Stat row** at top, reusing the existing `StatCard` component: Total
    restaurants, Active count, Past due/Inactive count, plan-mix hint.
  - **Table**, one row per restaurant: name + type, plan badge, status badge
    (reuse `Badge` with a status→variant map, same style as
    `order-status-badge.tsx`), subscription period end date, and a **Manage**
    button.
  - **Manage** opens a `Sheet` (same primitive/pattern as `cart-drawer.tsx`)
    containing a form: status selector (trial/active/past_due/inactive),
    plan selector (free/basic/pro/custom), period start + end date inputs,
    and a payment-proof-reference text input. A "Save" button in the sheet
    applies the change to in-memory state (updates the matching `restaurants`
    entry's `status`/`planId`, and the matching `subscriptions` entry's
    `periodStart`/`periodEnd`/`paymentProofRef`) and closes the sheet.

No new dependencies required — `Sheet`, `Badge`, `StatCard`, `Input`, `Button`
all already exist. Plan/status selects use a native `<select>` styled like
the existing `Input`, consistent with how the rest of the app avoids adding
a new dropdown primitive for a handful of fixed options.

## Part 2 — Staff / Team section

Added inside the existing Settings page, as a new component kept separate
from `settings-form.tsx` (which manages restaurant-profile state tied to the
page's single "Save changes" button) because Team actions apply immediately,
the way `order-queue-board.tsx`'s "Advance" button does — no dependency on an
outer save step, so the two don't get tangled:

- `components/dashboard/team-section.tsx` — client component, own
  `useState<StaffUser[]>` seeded from `staffUsers.filter(s => s.restaurantId === restaurant.id)`.
  - Renders a small legend/caption explaining the two roles: "Owner — full
    access, including billing and menu" / "Staff — can manage orders and the
    kitchen queue; cannot edit the menu, settings, or billing."
  - Lists each staff member: name, phone, a role badge, and the per-role
    caption. The owner row is always listed first and is not editable or
    removable.
  - Non-owner rows get a role toggle (Owner/Staff) and a Remove button.
  - A compact "Add team member" inline form (name input, phone input, role
    toggle defaulting to Staff, "Add" button) appends a new `StaffUser` to
    local state.
- `app/dashboard/settings/page.tsx` renders `<TeamSection restaurant={restaurants[0]} />`
  as an additional card alongside the existing `SettingsForm`.

This is management UI only — there is no logged-in session to restrict, so
no dashboard nav item is actually hidden based on role. That's an explicit,
documented limitation (see Known limitations below), not an oversight.

## Error handling

None needed beyond what the rest of the app already does: form inputs use
plain HTML validation (e.g. `disabled` on empty required fields, matching the
onboarding wizard's pattern), and all mutations are synchronous in-memory
state updates that cannot fail.

## Testing / verification

This repo has no test framework (`package.json` has no test script or test
dependency) — verification for every existing feature is `npm run lint` +
`npm run build` + manual click-through in the browser. This spec follows the
same approach:

1. `npm run lint` and `npm run build` must pass.
2. Manual verification in the dev server:
   - `/admin` loads, shows all 4 mock restaurants with correct stat counts,
     Manage sheet opens/edits/saves and the table reflects the change
     immediately.
   - `/dashboard/settings` shows the new Team card, add/remove/role-toggle
     all work and persist for the session (reset on reload, same as
     Settings' own "Save changes" already behaves).

## Known limitations (by design, for now)

- No authentication — `/admin` and the Team role toggle are UI only, not
  enforced. Anyone who navigates to `/admin` today can see it, same as
  anyone can reach `/dashboard` today.
- No persistence — all admin edits and staff changes reset on page reload,
  consistent with every other mock-data screen in this app.
- `StaffUser` has no `authUserId` field yet (unlike the `staff_users` table
  sketched in `PROJECT_INSTRUCTIONS.md` section 7) since there's no auth user
  to reference — `name`/`phone` stand in for display purposes until real
  accounts exist. Add `authUserId` when Supabase auth is wired up.
