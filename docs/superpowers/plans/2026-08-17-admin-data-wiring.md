# Admin Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin` (`app/admin/page.tsx`, `components/admin/tenant-table.tsx`) read and write the real, already-live Supabase project instead of `lib/mock-data.ts` — every tenant's `restaurants`/`subscriptions` rows, not just the logged-in user's own restaurant — and finally resolve the cross-tenant RLS gap every prior sub-project (schema/RLS, auth, owner-data-wiring) explicitly deferred.

**Architecture:** A new `supabase/sql/07_admin.sql` adds a `platform_admins` table and an `is_platform_admin()` `SECURITY DEFINER` function (mirroring `is_staff_of()`'s existing shape in `02_rls.sql`), plus four new RLS policies (admin select/update on `restaurants`, admin select/insert on `subscriptions`). This lets `/admin`'s Server Component and Server Actions use the same ordinary cookie-authenticated `createServerSupabaseClient()` every owner-side page already uses — no service-role client, no admin-only RPCs — with Postgres RLS itself deciding whether the caller may see or touch a given row, exactly like the owner-side "RLS does the authorization work" principle. Two Server Actions in a new `lib/actions/admin-actions.ts` replace `tenant-table.tsx`'s local-state-only mutations: `updateTenantPlanStatus` (an `update`) and `recordSubscriptionPayment` (an `insert` — payment confirmations are an append-only ledger, never edited in place). Full rationale, including why this mechanism was chosen over a service-role client or admin-only RPCs, is in `docs/superpowers/specs/2026-08-17-admin-data-wiring-design.md`.

**Tech Stack:** Next.js 14 (App Router) Server Components + Server Actions, `@supabase/ssr` / `@supabase/supabase-js` (already installed), PostgreSQL via the already-live Supabase project.

## Global Constraints

- Follow this codebase's existing conventions: `"use client"` components with inline handlers, Tailwind utility classes inline, `@/` path aliases, double-quoted strings, no comments except where a hidden constraint is genuinely non-obvious.
- Every Server Action returns `{ error: string } | { data: T }`, never throws, matching `lib/actions/settings-actions.ts` / `order-actions.ts` / `staff-actions.ts` exactly.
- Neither new Server Action uses `lib/supabase/admin.ts` (the service-role client) — nothing here creates an `auth.users` row, so the ordinary RLS-scoped `createServerSupabaseClient()` is sufficient once `07_admin.sql`'s policies exist. Do not add an app-layer "is this caller an admin" re-check inside the actions themselves — RLS is the enforcement layer, consistent with every owner-side action's treatment of ordinary (non-service-role) writes.
- New SQL (`supabase/sql/07_admin.sql`) **cannot be executed by any task in this plan** — there is no `psql`/Supabase CLI/direct Postgres connection string available in `.env.local` (only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and unrelated WhatsApp/site vars — none of these let arbitrary DDL run against the live project). Task 1's verification is manual read-through. Every other task can still be live-verified for what doesn't require `07_admin.sql` (middleware gating, the page's own "not set up yet" fallback) — full cross-tenant read/write is blocked until the user pastes `07_admin.sql` into Supabase Studio.
- `subscriptions` stays append-only: `recordSubscriptionPayment` only ever inserts. No task adds an update or delete path for a subscription row.
- No changes to `middleware.ts`, `lib/dashboard/current-restaurant.ts`, or anything under `app/dashboard/` — this plan touches only `/admin` and its supporting files.

---

### Task 1: Cross-tenant RLS (`supabase/sql/07_admin.sql`)

**Files:**
- Create: `supabase/sql/07_admin.sql`

**Interfaces:**
- Consumes: `restaurants`, `subscriptions` tables (`01_schema.sql`), `auth.users` (Supabase-managed), `is_staff_of()` pattern (`02_rls.sql`, referenced as a style precedent only — not called).
- Produces: table `platform_admins(email text primary key)`; function `is_platform_admin() returns boolean`, callable both from RLS policies and directly as `supabase.rpc("is_platform_admin")`; four new policies on `restaurants` and `subscriptions`. Task 4's `app/admin/page.tsx` calls `is_platform_admin` by exactly this name via `.rpc()`. Task 3's Server Actions rely on the two write policies existing.

- [ ] **Step 1: Create the file**

Create `supabase/sql/07_admin.sql`:

```sql
-- 07_admin.sql
-- Cross-tenant read/write access for the platform admin panel (/admin).
-- Paste into Supabase Studio's SQL Editor and run AFTER 01_schema.sql,
-- 02_rls.sql, 03_storage.sql, 04_seed.sql, 05_auth.sql, and 06_orders.sql
-- are already applied.
--
-- Every existing policy in 02_rls.sql scopes access to is_staff_of(), with no
-- cross-tenant path — by design, per 02_rls.sql's header comment deferring
-- this to a later sub-project. This file adds that path for exactly the two
-- tables /admin reads or writes (restaurants, subscriptions), not a blanket
-- cross-tenant bypass — see
-- docs/superpowers/specs/2026-08-17-admin-data-wiring-design.md for the full
-- rationale, including why this is RLS policies + a table rather than a
-- service-role client or admin-only RPCs.
--
-- PLATFORM_ADMIN_EMAILS (middleware.ts) is a Next.js env var; Postgres has no
-- way to read it. platform_admins is the Postgres-side mirror of that same
-- allowlist, checked by is_platform_admin() below. These two lists are
-- independent and must be kept in sync by hand (see SETUP_TODO.md) — the env
-- var gates *reaching* /admin at all (middleware), this table gates what an
-- authenticated request can actually read/write once there (RLS).

create table platform_admins (
  email text primary key
);

alter table platform_admins enable row level security;
-- Deliberately no policies: nobody reads or writes this table through the
-- API, ever, including admins themselves — it's only consulted from inside
-- is_platform_admin() below (SECURITY DEFINER bypasses RLS on the tables it
-- queries). Managed by hand via Supabase Studio's Table Editor.

-- Is the current authenticated user a platform admin? Mirrors is_staff_of()'s
-- shape (02_rls.sql) — SECURITY DEFINER so this can read auth.users (not
-- normally exposed to authenticated roles) and platform_admins (no policies
-- of its own) without recursion or permission errors. Case-insensitive
-- match, same as middleware.ts's PLATFORM_ADMIN_EMAILS check. Also callable
-- directly as an RPC (app/admin/page.tsx uses this to distinguish "not a
-- platform admin yet" from "this platform genuinely has zero tenants").
create function is_platform_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from auth.users u
    join public.platform_admins pa on lower(pa.email) = lower(u.email)
    where u.id = auth.uid()
  );
$$;

-- restaurants: admins can see and edit every tenant's plan/status. Combined
-- with the existing "staff update restaurants" policy (02_rls.sql) via OR —
-- an admin doesn't need to also be staff of a restaurant to manage it.
create policy "platform admin read restaurants" on restaurants for select using (is_platform_admin());
create policy "platform admin update restaurants" on restaurants for update
  using (is_platform_admin()) with check (is_platform_admin());

-- subscriptions: admins can see every tenant's billing history and record a
-- new payment confirmation. Insert only, not update — each confirmation is
-- an append-only ledger entry, not an edit of a past one (see design spec's
-- "Payment confirmation is append-only" section).
create policy "platform admin read subscriptions" on subscriptions for select using (is_platform_admin());
create policy "platform admin insert subscriptions" on subscriptions for insert with check (is_platform_admin());
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm:
- `platform_admins`, `restaurants`, `subscriptions` are exact table names from `01_schema.sql` / this file.
- `is_platform_admin()` has no `revoke`/`grant` statements — matching `is_staff_of()`'s own precedent (predicate helper functions stay on Postgres's default grants; only the mutating bootstrap RPCs in `05_auth.sql`/`06_orders.sql` restrict `execute` explicitly).
- The four new policies are **additive** — nothing in this file drops or replaces any policy from `02_rls.sql`. `restaurants` now has three `select`-eligible paths in total for staff-scoped rows (`"public read restaurants"` already allows anyone to `select`, so the new admin `select` policy is actually redundant for reads — it's kept anyway for symmetry with the `update` policy and to make the admin RLS surface self-documenting on its own, independent of `restaurants`' public-read policy possibly changing later) and two `update`-eligible paths (`is_staff_of(id)` OR `is_platform_admin()`).
- No policy references any table besides `restaurants` and `subscriptions` — `/admin` gets no new access to menu, order, staff, or driver data.

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/07_admin.sql
git commit -m "feat: add cross-tenant RLS for the platform admin panel (07_admin.sql)"
```

---

### Task 2: `mapSubscriptionRow`

**Files:**
- Modify: `lib/supabase/mappers.ts` (currently 91 lines, shown in full in the design spec's context)

**Interfaces:**
- Produces: `mapSubscriptionRow(row: Record<string, unknown>): Subscription`, following every other mapper function's exact shape in this file.
- Consumes: `Subscription` from `@/lib/types`.

- [ ] **Step 1: Add the `Subscription` import**

In `lib/supabase/mappers.ts`, replace the import line:

```ts
import type { Restaurant, MenuCategory, MenuItem, ItemAddon, Order, OrderLineItem, StaffUser } from "@/lib/types";
```

with:

```ts
import type { Restaurant, MenuCategory, MenuItem, ItemAddon, Order, OrderLineItem, StaffUser, Subscription } from "@/lib/types";
```

- [ ] **Step 2: Add the mapper**

Append to the end of `lib/supabase/mappers.ts`:

```ts

export function mapSubscriptionRow(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    paymentProofRef: (row.payment_proof_ref as string) ?? undefined,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/mappers.ts
git commit -m "feat: add mapSubscriptionRow"
```

---

### Task 3: Admin Server Actions (`lib/actions/admin-actions.ts`)

**Files:**
- Create: `lib/actions/admin-actions.ts`

**Interfaces:**
- Produces: `updateTenantPlanStatus(restaurantId: string, patch: TenantPlanStatusPatch): Promise<ActionResult<Restaurant>>`; `recordSubscriptionPayment(input: RecordSubscriptionPaymentInput): Promise<ActionResult<Subscription>>`. Task 4's `components/admin/tenant-table.tsx` calls both by these exact names and shapes.
- Consumes: `createServerSupabaseClient` (`lib/supabase/server.ts`), `mapRestaurantRow`/`mapSubscriptionRow` (Task 2), `Restaurant`/`Subscription` from `@/lib/types`.

- [ ] **Step 1: Create the file**

Create `lib/actions/admin-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow, mapSubscriptionRow } from "@/lib/supabase/mappers";
import type { Restaurant, Subscription } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export interface TenantPlanStatusPatch {
  planId: Restaurant["planId"];
  status: Restaurant["status"];
}

export async function updateTenantPlanStatus(
  restaurantId: string,
  patch: TenantPlanStatusPatch
): Promise<ActionResult<Restaurant>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({ plan_id: patch.planId, status: patch.status })
    .eq("id", restaurantId)
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to update plan/status" };
  revalidatePath("/admin");
  return { data: mapRestaurantRow(data) };
}

export interface RecordSubscriptionPaymentInput {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  paymentProofRef?: string;
}

export async function recordSubscriptionPayment(
  input: RecordSubscriptionPaymentInput
): Promise<ActionResult<Subscription>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      restaurant_id: input.restaurantId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      payment_proof_ref: input.paymentProofRef || null,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to record payment" };
  revalidatePath("/admin");
  return { data: mapSubscriptionRow(data) };
}
```

- [ ] **Step 2: Self-review**

Confirm both actions: return `{ error }` on any Postgrest error or missing row, never throw; use `createServerSupabaseClient()` (not the service-role client); call `revalidatePath("/admin")` only on success; `recordSubscriptionPayment` uses `.insert()`, never `.update()`.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/admin-actions.ts
git commit -m "feat: add admin Server Actions for tenant plan/status and payment recording"
```

---

### Task 4: Wire `/admin` to real data

**Files:**
- Modify: `app/admin/page.tsx` (currently 16 lines, shown in full above)
- Modify: `components/admin/tenant-table.tsx` (currently 235 lines, shown in full above)

**Interfaces:**
- Consumes: `createServerSupabaseClient` (`lib/supabase/server.ts`), `mapRestaurantRow`/`mapSubscriptionRow` (Task 2), `updateTenantPlanStatus`/`recordSubscriptionPayment` (Task 3), `is_platform_admin` RPC (Task 1).
- No change to `TenantTable`'s exported prop shape (`initialRestaurants: Restaurant[]`, `initialSubscriptions: Subscription[]`) — `app/admin/page.tsx` still passes exactly these two props.

- [ ] **Step 1: Replace `app/admin/page.tsx`**

Replace the full contents of `app/admin/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow, mapSubscriptionRow } from "@/lib/supabase/mappers";
import { TenantTable } from "@/components/admin/tenant-table";

export default async function AdminPage() {
  const supabase = createServerSupabaseClient();

  // Middleware already confirmed the logged-in user's email is in
  // PLATFORM_ADMIN_EMAILS before letting this request through — but that env
  // var and the platform_admins table it's mirrored into (07_admin.sql) are
  // two independent lists (see the admin data-wiring design spec). Checking
  // is_platform_admin() here distinguishes "not fully set up as an admin
  // yet" from "this platform genuinely has zero tenants," so a mismatch
  // never silently looks like an empty table.
  const { data: isAdmin, error: isAdminError } = await supabase.rpc("is_platform_admin");

  if (isAdminError || !isAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Restaurants</h1>
        <div className="mt-4 max-w-xl rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">Not fully set up as a platform admin yet</p>
          <p className="mt-1 text-muted-foreground">
            Your account passed the <code>PLATFORM_ADMIN_EMAILS</code> check to reach this page, but isn&apos;t
            listed in the <code>platform_admins</code> table yet (or{" "}
            <code>supabase/sql/07_admin.sql</code> hasn&apos;t been run against this project). Add your email to{" "}
            <code>platform_admins</code> in Supabase Studio — see SETUP_TODO.md — then reload this page.
          </p>
        </div>
      </div>
    );
  }

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

- [ ] **Step 2: Replace `components/admin/tenant-table.tsx`**

Replace the full contents of `components/admin/tenant-table.tsx`:

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
import { updateTenantPlanStatus, recordSubscriptionPayment } from "@/lib/actions/admin-actions";

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
  // subscriptions is ordered by created_at desc (app/admin/page.tsx), and
  // stays that way here (new rows are prepended, never appended) — so the
  // first match is always the tenant's latest billing period.
  const managingSub = subscriptions.find((s) => s.restaurantId === managingId) ?? null;

  const total = restaurants.length;
  const active = restaurants.filter((r) => r.status === "active").length;
  const pastDueOrInactive = restaurants.filter((r) => r.status === "past_due" || r.status === "inactive").length;
  const planMix = (["free", "basic", "pro", "custom"] as Restaurant["planId"][])
    .map((p) => `${restaurants.filter((r) => r.planId === p).length} ${PLAN_LABEL[p]}`)
    .join(" · ");

  function handlePlanStatusSaved(updated: Restaurant) {
    setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handlePaymentRecorded(inserted: Subscription) {
    setSubscriptions((prev) => [inserted, ...prev]);
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
              onPlanStatusSaved={handlePlanStatusSaved}
              onPaymentRecorded={handlePaymentRecorded}
              onClose={() => setManagingId(null)}
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
  const [status, setStatus] = useState(restaurant.status);
  const [planId, setPlanId] = useState(restaurant.planId);
  const [planSaving, setPlanSaving] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState(subscription?.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(subscription?.periodEnd ?? "");
  const [paymentProofRef, setPaymentProofRef] = useState(subscription?.paymentProofRef ?? "");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function savePlanStatus() {
    setPlanSaving(true);
    setPlanError(null);
    setPlanSaved(false);
    const result = await updateTenantPlanStatus(restaurant.id, { planId, status });
    setPlanSaving(false);
    if ("error" in result) {
      setPlanError(result.error);
      return;
    }
    onPlanStatusSaved(result.data);
    setPlanSaved(true);
  }

  async function savePayment() {
    setPaymentSaving(true);
    setPaymentError(null);
    setPaymentSaved(false);
    const result = await recordSubscriptionPayment({
      restaurantId: restaurant.id,
      periodStart,
      periodEnd,
      paymentProofRef: paymentProofRef || undefined,
    });
    setPaymentSaving(false);
    if ("error" in result) {
      setPaymentError(result.error);
      return;
    }
    onPaymentRecorded(result.data);
    setPaymentSaved(true);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{restaurant.name}</SheetTitle>
      </SheetHeader>

      <div className="mt-4 flex flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-border pb-6">
          <p className="text-sm font-semibold">Plan &amp; status</p>
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

          <div className="flex items-center justify-between">
            <Button size="sm" onClick={savePlanStatus} disabled={planSaving}>
              {planSaving ? "Saving…" : "Update plan & status"}
            </Button>
            {planSaved && <p className="text-sm text-success">Saved.</p>}
          </div>
          {planError && <p className="text-sm text-destructive">{planError}</p>}
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold">Record a payment</p>
          <p className="text-xs text-muted-foreground">
            Adds a new billing period to this tenant&apos;s payment history — it doesn&apos;t edit a past
            confirmation.
          </p>
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

          <div className="flex items-center justify-between">
            <Button size="sm" onClick={savePayment} disabled={paymentSaving || !periodStart || !periodEnd}>
              {paymentSaving ? "Recording…" : "Record payment"}
            </Button>
            {paymentSaved && <p className="text-sm text-success">Recorded.</p>}
          </div>
          {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Self-review**

Confirm:
- `app/admin/page.tsx` no longer imports from `@/lib/mock-data`.
- The `is_platform_admin` fallback branch renders *before* any table/query that would otherwise silently return zero rows.
- `ManageTenantForm`'s two save buttons are fully independent — saving plan/status does not touch `periodStart`/`periodEnd`/`paymentProofRef` state or call `recordSubscriptionPayment`, and vice versa.
- "Record payment" is disabled when either date field is empty, matching this app's existing "disabled on empty required field" convention (`team-section.tsx`'s "Add team member" button).
- No `useState` anywhere still seeds from `lib/mock-data.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx components/admin/tenant-table.tsx
git commit -m "feat: wire admin panel to real Supabase data"
```

---

### Task 5: Update `SETUP_TODO.md` and `README.md`

**Files:**
- Modify: `SETUP_TODO.md`
- Modify: `README.md`

- [ ] **Step 1: `SETUP_TODO.md`**

In the numbered list under "## 1. Create the Supabase project (required to go live)", after the existing step 7 (`Also paste and run supabase/sql/06_orders.sql...`), insert a new step 8, renumbering the old steps 8–9 to 9–10:

```markdown
8. Also paste and run `supabase/sql/07_admin.sql` — adds the `platform_admins`
   table and `is_platform_admin()` RLS policies that let `/admin` read and
   manage every tenant. Then, in Supabase Studio's Table Editor, add one row
   to `platform_admins` for **every** email already in `PLATFORM_ADMIN_EMAILS`
   (see step 3) — these are two independent lists that must be kept in sync
   by hand: the env var controls who can *reach* `/admin` at all, this table
   controls what an authenticated request can actually read or write once
   there. If you skip this, `/admin` will load a "not fully set up as a
   platform admin yet" message instead of the tenant list.
```

Then update old step 8 (now step 9) — replace:

```markdown
8. `/dashboard` (menu, orders, analytics, settings, team) and the storefront
   (menu display, checkout, order tracking) now read and write this real
   database — every owner sees and edits their own restaurant's actual data,
   not `lib/mock-data.ts`.
```

with:

```markdown
9. `/dashboard` (menu, orders, analytics, settings, team), the storefront
   (menu display, checkout, order tracking), and `/admin` (every tenant's
   plan, status, and billing history) now read and write this real database —
   nothing left reads `lib/mock-data.ts`.
```

And renumber the old step 9 (Realtime) to step 10 (text unchanged).

In "## 4. Collecting your own subscription payments", replace:

```markdown
2. Use the `/admin` panel to record payment confirmations and activate
   accounts (mock data only for now — see section 1.7; the panel itself is
   gated behind real login, see section 3).
```

with:

```markdown
2. Use the `/admin` panel to record payment confirmations and activate
   accounts — this is real now (see section 1, step 8); the panel itself is
   gated behind real login plus the `PLATFORM_ADMIN_EMAILS`/`platform_admins`
   allowlist (see section 3).
```

In "## What's already done", replace:

```markdown
- Platform admin panel (`/admin`) for managing tenant plan/status/billing,
  and per-restaurant team/staff role management in Settings — mock data
  only, but gated behind real login and the `PLATFORM_ADMIN_EMAILS`
  allowlist.
```

with:

```markdown
- Platform admin panel (`/admin`) for managing tenant plan/status/billing —
  real, cross-tenant Supabase data, gated behind real login, the
  `PLATFORM_ADMIN_EMAILS` allowlist, and RLS (`platform_admins` /
  `is_platform_admin()`) — and per-restaurant team/staff role management in
  Settings.
```

- [ ] **Step 2: `README.md`**

Replace the "Status" section:

```markdown
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
```

with:

```markdown
Frontend + a live Supabase backend for auth, the owner dashboard, the
storefront, and the platform admin panel. `/dashboard` (menu builder, orders,
analytics, settings, team), the storefront (menu display, checkout, order
tracking), and `/admin` (every tenant's plan/status/billing) all read and
write real data — nothing left reads `lib/mock-data.ts`. `/admin` reaches
across every tenant via a small set of RLS policies gated by a
`platform_admins` table + `is_platform_admin()` function
(`supabase/sql/07_admin.sql`), kept in sync by hand with the
`PLATFORM_ADMIN_EMAILS` env var that gates the route itself — see
`docs/superpowers/specs/2026-08-17-admin-data-wiring-design.md` for why.
`/login`, `/onboarding`, `/dashboard`, and `/admin` all require
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to be set (see
`.env.local` / `.env.example`) — without them those routes fail to build or
render. See `SETUP_TODO.md` for the remaining steps (WhatsApp Cloud API, a
domain) before this is fully live for real customers.
```

Replace the "Known limitations" bullet:

```markdown
- `/admin` (the platform admin panel) still shows mock data — every RLS
  policy scopes to a restaurant's own staff, with no cross-tenant read path
  yet for the admin panel; that's a future sub-project.
```

with:

```markdown
- `/admin`'s cross-tenant access depends on two independently-maintained
  admin allowlists (the `PLATFORM_ADMIN_EMAILS` env var, and the
  `platform_admins` table added by `supabase/sql/07_admin.sql`) — adding a
  new platform admin means updating both, by hand, in two different places.
  See `docs/superpowers/specs/2026-08-17-admin-data-wiring-design.md` for why
  this tradeoff was chosen over a single service-role-backed admin client.
```

- [ ] **Step 3: Commit**

```bash
git add SETUP_TODO.md README.md
git commit -m "docs: document admin panel data wiring in SETUP_TODO and README"
```

---

### Task 6: Final build verification and live smoke test

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run `npm run build`. Must succeed with no TypeScript or lint errors. Confirm no remaining reference to `lib/mock-data.ts`'s `restaurants`/`subscriptions` exports from anywhere under `app/admin/` or `components/admin/` (`restaurants`/`subscriptions` are still legitimately imported elsewhere, e.g. `lib/mock-data.ts` itself, `04_seed.sql`'s seed values, and any storefront/dashboard code already wired in the prior sub-project — this check is scoped to the admin surface only).

- [ ] **Step 2: Live smoke test — what's testable before `07_admin.sql` is applied**

`07_admin.sql` cannot be run by this plan (see Global Constraints) — full cross-tenant read/write cannot be live-verified yet. What can be verified against the real project without it:
1. Add a temporary, local-only override to `.env.local` (never commit): `PLATFORM_ADMIN_EMAILS=<a real seeded or freshly-created test login's email>`.
2. Log in as that account, navigate to `/admin` directly.
3. Confirm `middleware.ts` lets the request through (no redirect to `/dashboard`).
4. Confirm the page renders the "Not fully set up as a platform admin yet" message from Task 4 — this is the expected, correct state today, since `platform_admins`/`is_platform_admin()` don't exist on the live project until the user runs `07_admin.sql`. This exercises the exact fallback path designed to prevent the "silently returns zero rows" failure mode.
5. Report exactly this state in the final summary — do not claim the tenant table, plan/status update, or payment recording were live-verified, since they cannot be until the user applies `07_admin.sql`.

- [ ] **Step 3: Full end-to-end verification (for the user, after applying `07_admin.sql`)**

Document in the final report, for the user to run themselves:
1. Paste `supabase/sql/07_admin.sql` into Supabase Studio's SQL Editor, run it.
2. Insert their own email into `platform_admins`.
3. Reload `/admin` — the tenant table should now show every seeded restaurant.
4. Open "Manage" on one tenant, change its plan/status, click "Update plan & status" — confirm the table's badge/plan column updates and a reload still shows the new value.
5. In the same sheet, fill in a payment period + reference, click "Record payment" — confirm the table's "Period ends" column updates and a reload still shows it.
6. Confirm a second tenant is unaffected by either change (no cross-tenant leakage in the *values* written, even though cross-tenant *read* is now intentional).
