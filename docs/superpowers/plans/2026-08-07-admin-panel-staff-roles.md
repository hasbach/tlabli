# Admin Panel + Staff Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a platform-operator admin panel (`/admin`) and per-restaurant staff/team management (in Settings), both as mock-data-backed UI matching every other screen in this Next.js app — no real auth or backend exists yet, so these are management UI only, ready to wire to Supabase later.

**Architecture:** Two new mock-data-backed types (`Subscription`, `StaffUser`) extend `lib/types.ts`/`lib/mock-data.ts`. The admin panel is a new top-level route (`app/admin/`) with its own minimal layout and one client component (`TenantTable`) holding stat cards, a tenant table, and a `Sheet`-based edit form. Staff/team management is a new client component (`TeamSection`) added as an extra card on the existing Settings page. Both follow the codebase's established pattern: a server component page reads arrays from `lib/mock-data.ts` and hands them to a client component that owns its own `useState`, with all writes living only in memory for the session.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, existing hand-rolled UI primitives (`Card`, `Badge`, `Button`, `Input`, `Label`, `Sheet`, `StatCard`) — no new dependencies.

## Global Constraints

- No test framework exists in this repo (`package.json` has no test script/dependency) — verification is `npm run lint` + `npm run build` + manual click-through in the dev server, per every existing feature in this codebase and per the approved spec.
- No authentication exists (`/dashboard` isn't gated) — do not add login gating, route protection, or real permission enforcement in this plan. Both features are UI + mock data only.
- All mutations are client-side `useState`, reset on page reload — do not add persistence.
- Follow existing code style exactly: Tailwind utility classes inline (no CSS modules), `"use client"` directive at the top of any interactive component, `@/` path alias for imports, double-quoted strings, no comments except where a hidden constraint exists (matches the rest of this codebase).
- `Restaurant.planId` and `Restaurant.status` remain the single source of truth for a tenant's current plan/status — `Subscription` only adds `periodStart`/`periodEnd`/`paymentProofRef`, per the approved design spec (`docs/superpowers/specs/2026-08-07-admin-panel-staff-roles-design.md`).

---

### Task 1: Data model — `Subscription` and `StaffUser` types

**Files:**
- Modify: `lib/types.ts:111-119` (insert after the `PromoCode` interface, before `AnalyticsSnapshot`)

**Interfaces:**
- Produces: `Subscription` (fields: `id: string`, `restaurantId: string`, `periodStart: string`, `periodEnd: string`, `paymentProofRef?: string`), `StaffRole` (`"owner" | "staff"`), `StaffUser` (fields: `id: string`, `restaurantId: string`, `name: string`, `phone: string`, `role: StaffRole`). Every later task imports these from `@/lib/types`.

- [ ] **Step 1: Add the three type definitions**

Open `lib/types.ts`. The file currently reads (lines 111-120):

```ts
export interface PromoCode {
  id: string;
  restaurantId: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  active: boolean;
}

export interface AnalyticsSnapshot {
```

Replace it with:

```ts
export interface PromoCode {
  id: string;
  restaurantId: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  active: boolean;
}

export interface Subscription {
  id: string;
  restaurantId: string;
  periodStart: string; // ISO date, e.g. "2026-07-01"
  periodEnd: string; // ISO date
  paymentProofRef?: string; // OMT/Whish reference note, set by admin
}

export type StaffRole = "owner" | "staff";

export interface StaffUser {
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  role: StaffRole;
}

export interface AnalyticsSnapshot {
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds (these are additive type declarations, nothing consumes them yet).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add Subscription and StaffUser types"
```

---

### Task 2: Mock data — `subscriptions` and `staffUsers`

**Files:**
- Modify: `lib/mock-data.ts:5-12` (type import list), `lib/mock-data.ts:123-125` (insert new arrays between the `restaurants` array and the `categories` array)

**Interfaces:**
- Consumes: `Subscription`, `StaffUser` from `@/lib/types` (Task 1). Existing `restaurants` array ids: `r-fastfood`, `r-bakery`, `r-finedining`, `r-cafe`.
- Produces: `export const subscriptions: Subscription[]`, `export const staffUsers: StaffUser[]`. Task 3 consumes `subscriptions`; Task 4 consumes both via the admin page; Task 6 consumes `staffUsers`.

- [ ] **Step 1: Add the two new types to the import list**

Open `lib/mock-data.ts`. Lines 5-12 currently read:

```ts
import type {
  Restaurant,
  MenuCategory,
  MenuItem,
  Order,
  AnalyticsSnapshot,
  Driver,
} from "./types";
```

Replace with:

```ts
import type {
  Restaurant,
  MenuCategory,
  MenuItem,
  Order,
  AnalyticsSnapshot,
  Driver,
  Subscription,
  StaffUser,
} from "./types";
```

- [ ] **Step 2: Add the `subscriptions` and `staffUsers` arrays**

Find the end of the `restaurants` array (it closes with `];` on line 123, followed by a blank line and then `export const categories: MenuCategory[] = [` with a `// Burger House` comment). Insert the following block between the closing `];` of `restaurants` and the `export const categories` line:

```ts
export const subscriptions: Subscription[] = [
  {
    id: "sub-fastfood",
    restaurantId: "r-fastfood",
    periodStart: "2026-07-15",
    periodEnd: "2026-08-15",
    paymentProofRef: "OMT ref #48213",
  },
  {
    id: "sub-bakery",
    restaurantId: "r-bakery",
    periodStart: "2026-07-01",
    periodEnd: "2026-08-01",
  },
  {
    id: "sub-finedining",
    restaurantId: "r-finedining",
    periodStart: "2026-07-01",
    periodEnd: "2026-08-01",
    paymentProofRef: "Whish Money ref #77410",
  },
  {
    id: "sub-cafe",
    restaurantId: "r-cafe",
    periodStart: "2026-07-20",
    periodEnd: "2026-08-20",
  },
];

export const staffUsers: StaffUser[] = [
  { id: "st-fastfood-owner", restaurantId: "r-fastfood", name: "Rami Abou Chacra", phone: "+96170123456", role: "owner" },
  { id: "st-fastfood-1", restaurantId: "r-fastfood", name: "Nadine Fares", phone: "+96171112233", role: "staff" },
  { id: "st-fastfood-2", restaurantId: "r-fastfood", name: "Karim Haddad", phone: "+96176334455", role: "staff" },
  { id: "st-bakery-owner", restaurantId: "r-bakery", name: "Sara Khalil", phone: "+96176234567", role: "owner" },
  { id: "st-finedining-owner", restaurantId: "r-finedining", name: "Jean Nassar", phone: "+96181345678", role: "owner" },
  { id: "st-finedining-1", restaurantId: "r-finedining", name: "Elie Matta", phone: "+96181556677", role: "staff" },
  { id: "st-cafe-owner", restaurantId: "r-cafe", name: "Tarek Younes", phone: "+96178456789", role: "owner" },
];

```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add lib/mock-data.ts
git commit -m "feat: add subscriptions and staffUsers mock data"
```

---

### Task 3: Admin tenant table component

**Files:**
- Create: `components/admin/tenant-table.tsx`

**Interfaces:**
- Consumes: `Restaurant`, `Subscription` from `@/lib/types` (Task 1); `Card`, `CardContent` from `@/components/ui/card`; `Badge` from `@/components/ui/badge`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `Label` from `@/components/ui/label`; `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`; `StatCard` from `@/components/dashboard/stat-card` (props: `icon: LucideIcon`, `label: string`, `value: string`, `hint?: string`, `accent?: "primary" | "success" | "secondary"`).
- Produces: `export function TenantTable({ initialRestaurants: Restaurant[], initialSubscriptions: Subscription[] })`. Task 4 renders this with `restaurants` and `subscriptions` from mock data.

- [ ] **Step 1: Create the file**

Create `components/admin/tenant-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Building2, CheckCircle2, XCircle, Layers } from "lucide-react";
import type { Restaurant, Subscription } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatCard } from "@/components/dashboard/stat-card";

const STATUS_LABEL: Record<Restaurant["status"], string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  inactive: "Inactive",
};

const STATUS_VARIANT: Record<Restaurant["status"], "success" | "secondary" | "destructive" | "muted"> = {
  trial: "secondary",
  active: "success",
  past_due: "destructive",
  inactive: "muted",
};

const PLAN_LABEL: Record<Restaurant["planId"], string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  custom: "Custom",
};

const selectClass =
  "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ManagedFields = {
  status: Restaurant["status"];
  planId: Restaurant["planId"];
  periodStart: string;
  periodEnd: string;
  paymentProofRef: string;
};

export function TenantTable({
  initialRestaurants,
  initialSubscriptions,
}: {
  initialRestaurants: Restaurant[];
  initialSubscriptions: Subscription[];
}) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [managingId, setManagingId] = useState<string | null>(null);

  const managing = restaurants.find((r) => r.id === managingId) ?? null;
  const managingSub = subscriptions.find((s) => s.restaurantId === managingId) ?? null;

  const total = restaurants.length;
  const active = restaurants.filter((r) => r.status === "active").length;
  const pastDueOrInactive = restaurants.filter((r) => r.status === "past_due" || r.status === "inactive").length;
  const planMix = (["free", "basic", "pro", "custom"] as Restaurant["planId"][])
    .map((p) => `${restaurants.filter((r) => r.planId === p).length} ${PLAN_LABEL[p]}`)
    .join(" · ");

  function saveManaging(updated: ManagedFields) {
    if (!managingId) return;
    setRestaurants((prev) =>
      prev.map((r) => (r.id === managingId ? { ...r, status: updated.status, planId: updated.planId } : r))
    );
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.restaurantId === managingId
          ? {
              ...s,
              periodStart: updated.periodStart,
              periodEnd: updated.periodEnd,
              paymentProofRef: updated.paymentProofRef || undefined,
            }
          : s
      )
    );
    setManagingId(null);
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total restaurants" value={String(total)} />
        <StatCard icon={CheckCircle2} label="Active" value={String(active)} accent="success" />
        <StatCard icon={XCircle} label="Past due / inactive" value={String(pastDueOrInactive)} accent="secondary" />
        <StatCard icon={Layers} label="Plan mix" value={planMix} />
      </div>

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Restaurant</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period ends</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {restaurants.map((r) => {
              const sub = subscriptions.find((s) => s.restaurantId === r.id);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{r.type.replace("-", " ")}</p>
                  </td>
                  <td className="px-4 py-3">{PLAN_LABEL[r.planId]}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{sub?.periodEnd ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setManagingId(r.id)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Sheet open={managing !== null} onOpenChange={(open) => !open && setManagingId(null)}>
        <SheetContent>
          {managing && (
            <ManageTenantForm
              restaurant={managing}
              subscription={managingSub}
              onSave={saveManaging}
              onCancel={() => setManagingId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ManageTenantForm({
  restaurant,
  subscription,
  onSave,
  onCancel,
}: {
  restaurant: Restaurant;
  subscription: Subscription | null;
  onSave: (updated: ManagedFields) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState(restaurant.status);
  const [planId, setPlanId] = useState(restaurant.planId);
  const [periodStart, setPeriodStart] = useState(subscription?.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(subscription?.periodEnd ?? "");
  const [paymentProofRef, setPaymentProofRef] = useState(subscription?.paymentProofRef ?? "");

  return (
    <>
      <SheetHeader>
        <SheetTitle>{restaurant.name}</SheetTitle>
      </SheetHeader>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="mt-status">Status</Label>
          <select
            id="mt-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Restaurant["status"])}
            className={selectClass}
          >
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div>
          <Label htmlFor="mt-plan">Plan</Label>
          <select
            id="mt-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value as Restaurant["planId"])}
            className={selectClass}
          >
            <option value="free">Free</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mt-start">Period start</Label>
            <Input id="mt-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="mt-end">Period end</Label>
            <Input id="mt-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="mt-proof">Payment proof reference</Label>
          <Input
            id="mt-proof"
            value={paymentProofRef}
            onChange={(e) => setPaymentProofRef(e.target.value)}
            placeholder="e.g. OMT ref #12345"
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ status, planId, periodStart, periodEnd, paymentProofRef })}>
            Save changes
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds. (Nothing imports `TenantTable` yet, so this only checks the file itself type-checks — TypeScript still checks unreferenced files under `app`/`components` during `next build` type-checking, but if it does not surface an error for an orphaned file, this step just confirms no syntax errors; Task 4 will do the real integration check.)

- [ ] **Step 3: Commit**

```bash
git add components/admin/tenant-table.tsx
git commit -m "feat: add TenantTable admin component"
```

---

### Task 4: Admin route (`/admin`)

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `TenantTable` from `@/components/admin/tenant-table` (Task 3, props `initialRestaurants`, `initialSubscriptions`); `restaurants`, `subscriptions` from `@/lib/mock-data` (Task 2).

- [ ] **Step 1: Create the admin layout**

Create `app/admin/layout.tsx`:

```tsx
import { ShieldCheck } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center gap-2.5 border-b border-border bg-card px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <p className="font-extrabold tracking-tight">tlabli</p>
          <p className="text-xs text-muted-foreground">Platform Admin</p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6 sm:p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create the admin page**

Create `app/admin/page.tsx`:

```tsx
import { restaurants, subscriptions } from "@/lib/mock-data";
import { TenantTable } from "@/components/admin/tenant-table";

export default function AdminPage() {
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

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/admin` in a browser.

Expected:
- Header reads "tlabli" / "Platform Admin", visually distinct from the owner dashboard sidebar (dark icon badge instead of the primary-colored one).
- Four stat cards show: Total restaurants = 4, Active = 3 (Burger House, Le Jardin, Café Terra), Past due / inactive = 0, Plan mix listing counts for Free/Basic/Pro/Custom.
- Table lists all 4 mock restaurants with correct plan/status badges and period-end dates (Burger House: 2026-08-15, Sweet Crumbs: 2026-08-01, Le Jardin: 2026-08-01, Café Terra: 2026-08-20).
- Clicking "Manage" on any row opens a sheet from the right with that restaurant's name as the title, prefilled status/plan/dates/payment-proof fields.
- Changing status to "Inactive" and plan to "Custom" for Sweet Crumbs Bakery, then clicking "Save changes", closes the sheet and updates that row's badges and the stat cards (Active count unchanged, but the row now shows Inactive/Custom).
- Clicking "Cancel" in the sheet discards changes and closes it without altering the row.

- [ ] **Step 5: Commit**

```bash
git add app/admin
git commit -m "feat: add /admin platform admin route"
```

---

### Task 5: Team/staff section component

**Files:**
- Create: `components/dashboard/team-section.tsx`

**Interfaces:**
- Consumes: `Restaurant`, `StaffRole`, `StaffUser` from `@/lib/types` (Task 1); `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`; `Badge` from `@/components/ui/badge`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `Label` from `@/components/ui/label`.
- Produces: `export function TeamSection({ restaurant: Restaurant, initialStaff: StaffUser[] })`. Task 6 renders this from the Settings page.

- [ ] **Step 1: Create the file**

Create `components/dashboard/team-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Restaurant, StaffRole, StaffUser } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_CAPTION: Record<StaffRole, string> = {
  owner: "Full access, including billing and menu.",
  staff: "Can manage orders and the kitchen queue. Cannot edit the menu, settings, or billing.",
};

export function TeamSection({ restaurant, initialStaff }: { restaurant: Restaurant; initialStaff: StaffUser[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");

  const owner = staff[0];

  function addMember() {
    if (!name || !phone) return;
    setStaff((prev) => [
      ...prev,
      { id: `st-${restaurant.id}-${prev.length + 1}`, restaurantId: restaurant.id, name, phone, role },
    ]);
    setName("");
    setPhone("");
    setRole("staff");
  }

  function removeMember(id: string) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  function changeRole(id: string, newRole: StaffRole) {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, role: newRole } : s)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <p className="text-sm text-muted-foreground">
          Owner — {ROLE_CAPTION.owner} Staff — {ROLE_CAPTION.staff}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {staff.map((member) => {
            const isOwner = member.id === owner?.id;
            return (
              <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.phone}</p>
                </div>
                {isOwner ? (
                  <Badge>Owner</Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
                      {(["staff", "owner"] as StaffRole[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => changeRole(member.id, r)}
                          className={`px-2.5 py-1.5 capitalize transition-colors ${
                            member.role === r ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${member.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <Label htmlFor="team-phone">Phone</Label>
            <Input id="team-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 7X XXX XXX" />
          </div>
          <div className="flex items-end">
            <Button onClick={addMember} disabled={!name || !phone} className="w-full">
              Add team member
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/team-section.tsx
git commit -m "feat: add TeamSection staff management component"
```

---

### Task 6: Wire Team section into Settings page

**Files:**
- Modify: `app/dashboard/settings/page.tsx` (full file, currently 12 lines)

**Interfaces:**
- Consumes: `TeamSection` from `@/components/dashboard/team-section` (Task 5); `staffUsers` from `@/lib/mock-data` (Task 2).

- [ ] **Step 1: Update the Settings page**

Replace the full contents of `app/dashboard/settings/page.tsx` (currently):

```tsx
import { SettingsForm } from "@/components/dashboard/settings-form";
import { restaurants } from "@/lib/mock-data";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Business profile, currency display, and your plan.</p>
      <SettingsForm restaurant={restaurants[0]} />
    </div>
  );
}
```

with:

```tsx
import { SettingsForm } from "@/components/dashboard/settings-form";
import { TeamSection } from "@/components/dashboard/team-section";
import { restaurants, staffUsers } from "@/lib/mock-data";

export default function SettingsPage() {
  const restaurant = restaurants[0];
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Business profile, currency display, and your plan.</p>
      <SettingsForm restaurant={restaurant} />
      <div className="mt-6">
        <TeamSection
          restaurant={restaurant}
          initialStaff={staffUsers.filter((s) => s.restaurantId === restaurant.id)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev` (if not already running), open `http://localhost:3000/dashboard/settings`.

Expected:
- A new "Team" card appears below the existing Restaurant profile / Currency / Plan & billing / QR card layout.
- It shows the legend line explaining Owner vs Staff, then three rows: Rami Abou Chacra (Owner badge, no controls), Nadine Fares (Staff/Owner toggle + remove icon, "Staff" segment highlighted), Karim Haddad (same).
- Clicking the "Owner" segment on Nadine Fares's row highlights "Owner" instead of "Staff" (role toggled, no persistence needed to survive reload).
- Clicking the trash icon on Karim Haddad's row removes that row immediately.
- Filling in Name + Phone in the "Add team member" row and clicking "Add team member" appends a new Staff row; the button stays disabled while either field is empty.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/settings/page.tsx
git commit -m "feat: wire TeamSection into the Settings page"
```

---

### Task 7: Update docs and final verification

**Files:**
- Modify: `README.md:36-46` (What to look at) and `README.md:48-66` (Project structure)
- Modify: `SETUP_TODO.md:64-72` (What's already done)

**Interfaces:**
- None — documentation only, no code interfaces produced or consumed.

- [ ] **Step 1: Update README's "What to look at" list**

In `README.md`, the block currently reads (lines 36-46):

```md
## What to look at

- `/` — marketing site
- `/templates` — the 4 menu template gallery
- `/burger-house`, `/sweet-crumbs`, `/le-jardin`, `/cafe-terra` — live template
  previews (Fast Food, Bakery, Fine Dining, Café), each with working cart +
  WhatsApp checkout
- `/onboarding` — restaurant type & template picker wizard
- `/dashboard` — owner dashboard (menu builder, kitchen order queue,
  analytics, settings) — currently shows Burger House's demo data
- `/order/o-1001` — customer-facing order status tracking page
```

Replace with:

```md
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
```

- [ ] **Step 2: Update README's project structure block**

In `README.md`, the block currently reads (lines 48-66):

```md
## Project structure

```
app/                     Next.js routes (marketing, templates, dashboard, onboarding, order tracking)
components/
  ui/                     Hand-rolled shadcn-style primitives (button, card, sheet, tabs, ...)
  marketing/              Landing page sections
  storefront/             Cart, checkout, menu item card, language switcher, QR code
  templates/              The 4 menu template layouts (fast-food, bakery, fine-dining, cafe)
  dashboard/               Sidebar, stat cards, order queue, menu builder, analytics, settings
lib/
  types.ts                Data model (mirrors PROJECT_INSTRUCTIONS.md section 7)
  mock-data.ts             Demo restaurants/menus/orders — swap for Supabase later
  menu.ts                  getMenuSections() — the one function to swap for a real query
  whatsapp.ts              wa.me order message builder
  i18n/                    en/ar/fr dictionaries + locale/RTL provider
  supabase/client.ts        Inert stub until Supabase is connected
design-system/tlabli/       Design tokens & rationale from the ui-ux-pro-max research
```
```

Replace with:

```md
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
```

- [ ] **Step 3: Update SETUP_TODO's "What's already done" list**

In `SETUP_TODO.md`, the block currently reads (lines 64-72):

```md
## What's already done

- Full Next.js + Tailwind app, 4 distinct menu templates (Fast Food, Bakery,
  Fine Dining, Café), owner dashboard (menu builder, kitchen order queue,
  analytics, settings), onboarding wizard, customer order tracking page.
- Dual currency ($ / L.L.) display throughout.
- Arabic (RTL), English, and French storefront language switching.
- Per-item availability toggle + time-window scheduling.
- Design system documented in `design-system/tlabli/MASTER.md`.
```

Replace with:

```md
## What's already done

- Full Next.js + Tailwind app, 4 distinct menu templates (Fast Food, Bakery,
  Fine Dining, Café), owner dashboard (menu builder, kitchen order queue,
  analytics, settings), onboarding wizard, customer order tracking page.
- Dual currency ($ / L.L.) display throughout.
- Arabic (RTL), English, and French storefront language switching.
- Per-item availability toggle + time-window scheduling.
- Platform admin panel (`/admin`) for managing tenant plan/status/billing,
  and per-restaurant team/staff role management in Settings — both UI + mock
  data only, ready to gate behind real auth once Supabase is connected.
- Design system documented in `design-system/tlabli/MASTER.md`.
```

- [ ] **Step 4: Run full verification**

Run: `npm run lint`
Expected: No errors.

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Full manual walkthrough**

Run: `npm run dev`. Repeat the manual checks from Task 4 Step 4 (`/admin`) and Task 6 Step 3 (`/dashboard/settings` Team card) in the same browser session to confirm nothing regressed after the doc edits, and additionally click through `/dashboard`, `/dashboard/menu`, `/dashboard/orders`, `/dashboard/analytics` to confirm the existing dashboard pages still render unchanged (no shared component was modified other than Settings' page file).

- [ ] **Step 6: Commit**

```bash
git add README.md SETUP_TODO.md
git commit -m "docs: document the admin panel and team/staff roles"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1–2 cover the spec's data model section. Task 3–4 cover the full admin panel section (stat row, table, Manage sheet with status/plan/period/payment-proof). Task 5–6 cover the full staff/team section (legend, owner row fixed, staff role toggle + remove, add-member form). Task 7 covers the spec's implicit requirement that docs stay accurate (README/SETUP_TODO already describe "what's built" and would go stale otherwise) plus the spec's full verification checklist.
- **Type consistency checked:** `Subscription`/`StaffRole`/`StaffUser` (Task 1) match usage in Task 2 (mock arrays), Task 3 (`TenantTable`/`ManageTenantForm` props), and Task 5 (`TeamSection` props) exactly — field names (`periodStart`, `periodEnd`, `paymentProofRef`, `restaurantId`, `role`) are identical across all tasks.
- **No placeholders:** every step has complete, runnable code; no "TODO"/"similar to Task N" shortcuts.
