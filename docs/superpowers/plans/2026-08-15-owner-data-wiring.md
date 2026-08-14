# Owner-Side Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/dashboard` (overview, menu builder, orders, settings, team, analytics) and the customer-facing storefront (menu display, checkout, order tracking) read and write the real, already-live Supabase project instead of `lib/mock-data.ts` — for the logged-in owner's actual restaurant, not a hardcoded mock.

**Architecture:** Dashboard pages stay Server Components but fetch through a new cookie-aware `lib/supabase/server.ts` client; a shared `getCurrentRestaurant()` helper (cached per request) resolves `auth.uid() → staff_users → restaurants` once and the dashboard layout uses it to redirect unauthorized/orphaned sessions. All writes go through Next.js Server Actions in `lib/actions/`, relying on Postgres RLS (already defined in `02_rls.sql`) to scope every write to the caller's own restaurant — no action re-implements that check. Staff-account creation is the one action that needs the Supabase service-role key, mirroring `scripts/seed-staff-logins.mjs`. The kitchen queue adds a Supabase Realtime subscription. A new `create_order` Postgres RPC (`06_orders.sql`) makes checkout write a real order with a race-free queue number.

**Tech Stack:** Next.js 14 (App Router) Server Components + Server Actions, `@supabase/ssr` (already installed), `@supabase/supabase-js` (already installed), PostgreSQL via the already-live Supabase project, `recharts` (unchanged, already used by `AnalyticsCharts`).

## Global Constraints

- Follow this codebase's existing conventions: `"use client"` components with inline handlers for interactivity, Tailwind utility classes inline, `@/` path aliases, double-quoted strings, no comments except where a hidden constraint is genuinely non-obvious. Server Actions are a **new** pattern for this codebase (introduced by this plan, per the approved design) — every Server Action file starts with `"use server"` at the top.
- Every Server Action returns `{ error: string } | { data: T }`, never throws, so calling client components can render an inline error instead of crashing.
- Ordinary writes (menu items, order status, settings, staff role/removal) use the **cookie-authenticated** server client (`createServerSupabaseClient()`), so `is_staff_of()` (already defined in `02_rls.sql`) scopes every write to the caller's own restaurant automatically. Only `addStaffMember` uses the service-role client (`lib/supabase/admin.ts`), because creating an `auth.users` row isn't something RLS can gate.
- `SUPABASE_SERVICE_ROLE_KEY` is read only by `lib/supabase/admin.ts` (server-only module, never imported by any `"use client"` file) and `scripts/seed-staff-logins.mjs` (unchanged, pre-existing). No task's automated verification needs it — the service-role path (staff creation) is verified live only if the implementer already has a real owner session to test with; otherwise it's read-through verified per Task 7's Step 3.
- New SQL (`supabase/sql/06_orders.sql`) **cannot be executed by any task in this plan** — there is no `psql`/Supabase CLI available; applying it to the live project means pasting into Supabase Studio, which only the user can do. Task 1's verification is manual read-through, same as every prior SQL task in this project's history. Every other task that depends on real data (Tasks 2–11) can still be live-verified for reads/writes that don't require `06_orders.sql` — only `createOrder` (Task 10) is blocked until the user applies it.
- `driver` assignment stays out of scope: the `drivers` table exists in the schema but no dashboard UI manages it, and no task in this plan adds one. Every mapped `Order.driver` is `undefined` for real data — `OrderQueueBoard`'s existing `order.driver?.name` optional-chaining already handles this without changes.
- Category creation stays out of scope: `MenuBuilder`'s current UI only adds/edits/deletes **items** within existing categories (there is no "add category" control anywhere in the component) — `lib/actions/menu-actions.ts` therefore only covers item CRUD, matching what the UI actually does today, not a new category-management feature.

---

### Task 1: `create_order` RPC (`supabase/sql/06_orders.sql`)

**Files:**
- Create: `supabase/sql/06_orders.sql`

**Interfaces:**
- Consumes: `restaurants` and `orders` tables from `01_schema.sql` (already live).
- Produces: a Postgres function `create_order(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type text, p_table_number text, p_address text, p_items jsonb, p_total numeric, p_currency text, p_promo_code text) returns orders`, callable by `anon` and `authenticated`. Task 10 (`lib/actions/order-actions.ts`) calls this by name with these exact ten parameter names, in this order.

- [ ] **Step 1: Create the file**

Create `supabase/sql/06_orders.sql`:

```sql
-- 06_orders.sql
-- Adds real order creation with a race-free per-restaurant queue number.
-- Paste into Supabase Studio's SQL Editor and run AFTER 01_schema.sql,
-- 02_rls.sql, 03_storage.sql, 04_seed.sql, and 05_auth.sql are already applied.
--
-- Queue numbers must be unique and increasing per restaurant even when two
-- customers check out at nearly the same instant. `SELECT MAX(queue_number)+1`
-- is racy (two concurrent calls can read the same max before either inserts).
-- Instead, restaurants gets its own atomic counter column: a single
-- `UPDATE ... RETURNING` takes a row lock on that restaurant for the
-- duration of the transaction, so concurrent callers are serialized safely.

alter table restaurants add column next_queue_number integer not null default 1;

-- restaurants' own RLS ("staff update restaurants") would block an anonymous
-- checkout from incrementing next_queue_number — SECURITY DEFINER is this
-- function's one deliberate, narrow bypass, same pattern as
-- create_restaurant_with_owner in 05_auth.sql. orders' own RLS already
-- allows anonymous insert ("anyone insert orders" in 02_rls.sql), so no
-- bypass is needed for the insert itself.
create or replace function create_order(
  p_restaurant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_order_type text,
  p_table_number text,
  p_address text,
  p_items jsonb,
  p_total numeric,
  p_currency text,
  p_promo_code text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue_number integer;
  new_order public.orders;
begin
  if p_restaurant_id is null then
    raise exception 'restaurant_id is required';
  end if;

  update public.restaurants
  set next_queue_number = next_queue_number + 1
  where id = p_restaurant_id
  returning next_queue_number - 1 into v_queue_number;

  if v_queue_number is null then
    raise exception 'restaurant not found';
  end if;

  insert into public.orders (
    restaurant_id, queue_number, customer_name, customer_phone, order_type,
    table_number, address, items, total, currency, status, promo_code
  )
  values (
    p_restaurant_id, v_queue_number, p_customer_name, p_customer_phone, p_order_type,
    p_table_number, p_address, p_items, p_total, p_currency, 'received', p_promo_code
  )
  returning * into new_order;

  return new_order;
end;
$$;

revoke execute on function create_order(uuid, text, text, text, text, text, jsonb, numeric, text, text) from public;
grant execute on function create_order(uuid, text, text, text, text, text, jsonb, numeric, text, text) to anon, authenticated;
```

- [ ] **Step 2: Manual consistency check**

Read the file back and confirm:
- `public.restaurants` and `public.orders` are the exact table names from `01_schema.sql`, and every referenced column (`next_queue_number` (new), `restaurant_id`, `queue_number`, `customer_name`, `customer_phone`, `order_type`, `table_number`, `address`, `items`, `total`, `currency`, `status`, `promo_code`) exists or is added here.
- The plpgsql local variable is named `v_queue_number`, **not** `next_queue_number` — reusing the column's exact name as a local variable name would make `set next_queue_number = next_queue_number + 1` ambiguous (Postgres's default `#variable_conflict` behavior raises "column reference is ambiguous" when a bare identifier matches both a plpgsql variable and a column referenced in the same SQL command).
- `status` is hardcoded to `'received'` — matches `01_schema.sql`'s `orders.status` default and the `OrderStatus` flow's starting point (`components/dashboard/order-status-badge.tsx`'s `ORDER_STATUS_FLOW`).
- `revoke`/`grant` restrict execution to `anon` and `authenticated` only (not `public`), and both roles are granted since checkout is anonymous but a logged-in owner could also theoretically call it for a test order.

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/06_orders.sql
git commit -m "feat: add create_order RPC for race-free order queue numbers (06_orders.sql)"
```

---

### Task 2: Server Supabase client, row mappers, and `getCurrentRestaurant()`

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/mappers.ts`
- Create: `lib/dashboard/current-restaurant.ts`
- Modify: `app/dashboard/layout.tsx` (currently 11 lines)
- Modify: `components/dashboard/sidebar.tsx` (currently 67 lines, shown in full above)

**Interfaces:**
- Produces: `createServerSupabaseClient()` (no args, returns a `SupabaseClient`) — used by every later task's Server Component/Action. `mapRestaurantRow`, `mapMenuCategoryRow`, `mapItemAddonRow`, `mapMenuItemRow`, `mapOrderRow`, `mapStaffUserRow` — each takes a raw Supabase row (snake_case columns) and returns the matching `lib/types.ts` shape (camelCase). `getCurrentRestaurant(): Promise<{ restaurant: Restaurant; role: StaffRole } | null>`, wrapped in React's `cache()`.
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` from `@/lib/supabase/client` (already exported there); `Restaurant`, `MenuCategory`, `MenuItem`, `ItemAddon`, `Order`, `OrderLineItem`, `StaffUser`, `StaffRole` from `@/lib/types`.

- [ ] **Step 1: Create the server client**

Create `lib/supabase/server.ts`:

```ts
// -----------------------------------------------------------------------------
// Server-side Supabase client for Server Components and Server Actions. Reads
// the session from the request's cookies (shared with middleware.ts and the
// browser client via @supabase/ssr). Server Components can't write cookies —
// setAll's try/catch swallows that case; middleware.ts already refreshes the
// session cookie on every /dashboard/* request, so this doesn't lose the
// session. Server Actions CAN write cookies, so the same setAll path works
// there too.
// -----------------------------------------------------------------------------

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./client";

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — cookies are read-only there.
        }
      },
    },
  });
}
```

- [ ] **Step 2: Create the row mappers**

Create `lib/supabase/mappers.ts`:

```ts
// -----------------------------------------------------------------------------
// Converts raw Supabase rows (snake_case columns, per supabase/sql/01_schema.sql)
// into this app's existing camelCase shapes (lib/types.ts) — every component
// that already renders Restaurant/MenuItem/Order/etc. from lib/mock-data.ts
// keeps working unchanged against these mapped objects.
// -----------------------------------------------------------------------------

import type { Restaurant, MenuCategory, MenuItem, ItemAddon, Order, OrderLineItem, StaffUser } from "@/lib/types";

export function mapRestaurantRow(row: Record<string, unknown>): Restaurant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    type: row.type as Restaurant["type"],
    templateId: row.template_id as Restaurant["templateId"],
    tagline: row.tagline as string,
    logoInitial: row.logo_initial as string,
    currency: row.currency as Restaurant["currency"],
    showBothCurrencies: row.show_both_currencies as boolean,
    lbpExchangeRate: Number(row.lbp_exchange_rate),
    languages: row.languages as Restaurant["languages"],
    hours: row.hours as Restaurant["hours"],
    planId: row.plan_id as Restaurant["planId"],
    status: row.status as Restaurant["status"],
    whatsappNumber: row.whatsapp_number as string,
    phone: row.phone as string,
    address: row.address as string,
  };
}

export function mapMenuCategoryRow(row: Record<string, unknown>): MenuCategory {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
  };
}

export function mapItemAddonRow(row: Record<string, unknown>): ItemAddon {
  return { id: row.id as string, name: row.name as string, extraPrice: Number(row.extra_price) };
}

export function mapMenuItemRow(row: Record<string, unknown>, addons: ItemAddon[]): MenuItem {
  return {
    id: row.id as string,
    categoryId: row.category_id as string,
    title: row.title as string,
    description: row.description as string,
    price: Number(row.price),
    imageUrl: (row.image_url as string) ?? null,
    isAvailable: row.is_available as boolean,
    availableFrom: (row.available_from as string) ?? undefined,
    availableUntil: (row.available_until as string) ?? undefined,
    addons,
    variants: (row.variants as string[]) ?? undefined,
    isPopular: row.is_popular as boolean,
  };
}

export function mapOrderRow(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    queueNumber: row.queue_number as number,
    restaurantId: row.restaurant_id as string,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    orderType: row.order_type as Order["orderType"],
    tableNumber: (row.table_number as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    items: row.items as OrderLineItem[],
    total: Number(row.total),
    currency: row.currency as Order["currency"],
    status: row.status as Order["status"],
    driver: undefined,
    promoCode: (row.promo_code as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export function mapStaffUserRow(row: Record<string, unknown>): StaffUser {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    name: row.name as string,
    phone: row.phone as string,
    role: row.role as StaffUser["role"],
  };
}
```

- [ ] **Step 3: Create `getCurrentRestaurant()`**

Create `lib/dashboard/current-restaurant.ts`:

```ts
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow } from "@/lib/supabase/mappers";
import type { Restaurant, StaffRole } from "@/lib/types";

export interface CurrentRestaurant {
  restaurant: Restaurant;
  role: StaffRole;
}

// Wrapped in cache() so every Server Component that calls this during one
// request's render shares a single query instead of one each.
export const getCurrentRestaurant = cache(async (): Promise<CurrentRestaurant | null> => {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("staff_users")
    .select("role, restaurants(*)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data || !data.restaurants) return null;

  return {
    restaurant: mapRestaurantRow(data.restaurants as unknown as Record<string, unknown>),
    role: data.role as StaffRole,
  };
});
```

- [ ] **Step 4: Redirect from the dashboard layout when there's no restaurant**

Replace the full contents of `app/dashboard/layout.tsx` (currently, in full):

```tsx
import { Sidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</main>
    </div>
  );
}
```

with:

```tsx
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar restaurant={current.restaurant} />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Make `Sidebar` take the restaurant as a prop**

Replace the full contents of `components/dashboard/sidebar.tsx` (currently, in full — already shown with the logout button from the Auth sub-project):

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, ClipboardList, BarChart3, Settings, ExternalLink, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { restaurants } from "@/lib/mock-data";
import { supabase } from "@/lib/supabase/client";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/menu", label: "Menu builder", icon: UtensilsCrossed },
  { href: "/dashboard/orders", label: "Orders & queue", icon: ClipboardList },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const restaurant = restaurants[0]; // TODO(supabase): swap for the authenticated owner's restaurant

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
          T
        </div>
        <span className="font-extrabold tracking-tight">tlabli</span>
      </div>

      <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          {restaurant.logoInitial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{restaurant.name}</p>
          <Link href={`/${restaurant.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            View live menu <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mx-3 mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>

      <div className="m-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        Running on demo data. Connect Supabase to go live — see <span className="font-medium text-foreground">SETUP_TODO.md</span>.
      </div>
    </aside>
  );
}
```

with:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, ClipboardList, BarChart3, Settings, ExternalLink, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import type { Restaurant } from "@/lib/types";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/menu", label: "Menu builder", icon: UtensilsCrossed },
  { href: "/dashboard/orders", label: "Orders & queue", icon: ClipboardList },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ restaurant }: { restaurant: Restaurant }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
          T
        </div>
        <span className="font-extrabold tracking-tight">tlabli</span>
      </div>

      <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          {restaurant.logoInitial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{restaurant.name}</p>
          <Link href={`/${restaurant.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            View live menu <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mx-3 mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>

      <div className="m-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        Running on demo data. Connect Supabase to go live — see <span className="font-medium text-foreground">SETUP_TODO.md</span>.
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors (this will fail if any later task hasn't updated a `<Sidebar />` usage, but there is only one call site: this layout).

- [ ] **Step 7: Live manual verification**

Run: `npm run dev`. While logged out, visit `/dashboard` → expect a redirect to `/login` (same as today, now via `getCurrentRestaurant()` returning `null` instead of the middleware-only check). If you have a real seeded owner login (from `scripts/seed-staff-logins.mjs`, per the Auth sub-project), log in and confirm the sidebar shows that owner's real restaurant name/slug/logo initial instead of "Burger House" mock data (unless the logged-in owner genuinely is Burger House's owner, in which case confirm it's coming from the real row by temporarily editing that restaurant's `name` in Supabase Studio and reloading — the sidebar should reflect the edit).

- [ ] **Step 8: Commit**

```bash
git add lib/supabase/server.ts lib/supabase/mappers.ts lib/dashboard/current-restaurant.ts app/dashboard/layout.tsx components/dashboard/sidebar.tsx
git commit -m "feat: wire dashboard layout and sidebar to the logged-in owner's real restaurant"
```

---

### Task 3: Shared analytics aggregation (`lib/analytics.ts`)

**Files:**
- Create: `lib/analytics.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (Task 2), `mapOrderRow` (Task 2).
- Produces: `getAnalyticsSnapshot(restaurantId: string, currency: Currency): Promise<AnalyticsSnapshot>` — used by Task 5 (Overview stat cards) and Task 8 (`/dashboard/analytics`).

- [ ] **Step 1: Create the file**

Create `lib/analytics.ts`:

```ts
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import type { AnalyticsSnapshot, Currency } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAnalyticsSnapshot(restaurantId: string, currency: Currency): Promise<AnalyticsSnapshot> {
  const supabase = createServerSupabaseClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: true });

  const empty: AnalyticsSnapshot = {
    ordersToday: 0,
    ordersThisWeek: 0,
    totalSalesToday: 0,
    totalSalesThisWeek: 0,
    currency,
    topItems: [],
    salesTrend: [],
    peakHours: [],
  };
  if (error || !data) return empty;

  const orders = data.map(mapOrderRow).filter((o) => o.status !== "cancelled");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const ordersToday = orders.filter((o) => new Date(o.createdAt) >= startOfToday);
  const totalSalesToday = ordersToday.reduce((sum, o) => sum + o.total, 0);
  const totalSalesThisWeek = orders.reduce((sum, o) => sum + o.total, 0);

  const itemCounts = new Map<string, number>();
  for (const o of orders) {
    for (const line of o.items) {
      itemCounts.set(line.title, (itemCounts.get(line.title) ?? 0) + line.quantity);
    }
  }
  const topItems = [...itemCounts.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const trendByDay = new Map<string, number>();
  for (const o of orders) {
    const day = new Date(o.createdAt).toLocaleDateString("en-US", { weekday: "short" });
    trendByDay.set(day, (trendByDay.get(day) ?? 0) + o.total);
  }
  const salesTrend = [...trendByDay.entries()].map(([date, sales]) => ({ date, sales }));

  const hourCounts = new Map<string, number>();
  for (const o of ordersToday) {
    const hour = new Date(o.createdAt)
      .toLocaleTimeString("en-US", { hour: "numeric" })
      .toLowerCase()
      .replace(" ", "");
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const peakHours = [...hourCounts.entries()].map(([hour, orders]) => ({ hour, orders }));

  return {
    ordersToday: ordersToday.length,
    ordersThisWeek: orders.length,
    totalSalesToday,
    totalSalesThisWeek,
    currency,
    topItems,
    salesTrend,
    peakHours,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (this file isn't imported anywhere yet, so no route changes, but it must type-check standalone).

- [ ] **Step 3: Manual read-through verification**

Confirm by reading: every field of the returned object matches `AnalyticsSnapshot` in `lib/types.ts` exactly (`ordersToday`, `ordersThisWeek`, `totalSalesToday`, `totalSalesThisWeek`, `currency`, `topItems: {title,count}[]`, `salesTrend: {date,sales}[]`, `peakHours: {hour,orders}[]`). Real end-to-end verification (does it produce sane numbers against real orders) happens in Task 5 once a page actually calls this.

- [ ] **Step 4: Commit**

```bash
git add lib/analytics.ts
git commit -m "feat: add shared analytics aggregation helper"
```

---

### Task 4: Menu Server Actions (`lib/actions/menu-actions.ts`)

**Files:**
- Create: `lib/actions/menu-actions.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (Task 2), `mapMenuItemRow` (Task 2).
- Produces: `createMenuItem(input: NewMenuItemInput): Promise<ActionResult<MenuItem>>`, `updateMenuItem(id: string, patch: MenuItemPatch): Promise<ActionResult<MenuItem>>`, `deleteMenuItem(id: string): Promise<ActionResult<true>>`. Task 5 (`MenuBuilder`) calls these three by name with these exact signatures.

- [ ] **Step 1: Create the file**

Create `lib/actions/menu-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuItemRow } from "@/lib/supabase/mappers";
import type { MenuItem } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export interface NewMenuItemInput {
  categoryId: string;
  title: string;
  description: string;
  price: number;
  isAvailable: boolean;
  availableFrom?: string;
  availableUntil?: string;
}

export type MenuItemPatch = Partial<
  Pick<MenuItem, "title" | "description" | "price" | "isAvailable" | "availableFrom" | "availableUntil">
>;

export async function createMenuItem(input: NewMenuItemInput): Promise<ActionResult<MenuItem>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      category_id: input.categoryId,
      title: input.title,
      description: input.description,
      price: input.price,
      is_available: input.isAvailable,
      available_from: input.availableFrom ?? null,
      available_until: input.availableUntil ?? null,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to create item" };
  revalidatePath("/dashboard/menu");
  return { data: mapMenuItemRow(data, []) };
}

export async function updateMenuItem(id: string, patch: MenuItemPatch): Promise<ActionResult<MenuItem>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.isAvailable !== undefined) update.is_available = patch.isAvailable;
  if (patch.availableFrom !== undefined) update.available_from = patch.availableFrom || null;
  if (patch.availableUntil !== undefined) update.available_until = patch.availableUntil || null;

  const { data, error } = await supabase.from("menu_items").update(update).eq("id", id).select().single();

  if (error || !data) return { error: error?.message ?? "Failed to update item" };
  revalidatePath("/dashboard/menu");
  return { data: mapMenuItemRow(data, []) };
}

export async function deleteMenuItem(id: string): Promise<ActionResult<true>> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/menu");
  return { data: true };
}
```

Note: `mapMenuItemRow(data, [])` always passes an empty `addons` array — `MenuBuilder`'s current UI never creates or edits addons (its "Save item" form has no addon fields), matching the existing mock data's items that do have addons only because they were hand-seeded, not built through this UI.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (unused until Task 5 wires it in, but must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/menu-actions.ts
git commit -m "feat: add menu item Server Actions"
```

---

### Task 5: Wire the menu builder to real data

**Files:**
- Modify: `app/dashboard/menu/page.tsx` (currently 19 lines, shown in full above)
- Modify: `components/dashboard/menu-builder.tsx` (currently 166 lines, shown in full above)

**Interfaces:**
- Consumes: `getCurrentRestaurant` (Task 2), `mapMenuCategoryRow`, `mapItemAddonRow`, `mapMenuItemRow` (Task 2), `createMenuItem`, `updateMenuItem`, `deleteMenuItem` (Task 4).

- [ ] **Step 1: Rewrite the menu page to fetch real data**

Replace the full contents of `app/dashboard/menu/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { MenuBuilder } from "@/components/dashboard/menu-builder";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuCategoryRow, mapItemAddonRow, mapMenuItemRow } from "@/lib/supabase/mappers";

export default async function MenuBuilderPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const { data: categoryRows } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("sort_order", { ascending: true });

  const categories = (categoryRows ?? []).map(mapMenuCategoryRow);
  const categoryIds = categories.map((c) => c.id);

  const { data: itemRows } = categoryIds.length
    ? await supabase.from("menu_items").select("*").in("category_id", categoryIds)
    : { data: [] };

  const itemIds = (itemRows ?? []).map((r) => r.id as string);
  const { data: addonRows } = itemIds.length
    ? await supabase.from("item_addons").select("*").in("item_id", itemIds)
    : { data: [] };

  const items = (itemRows ?? []).map((row) => {
    const addons = (addonRows ?? []).filter((a) => a.item_id === row.id).map(mapItemAddonRow);
    return mapMenuItemRow(row, addons);
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Menu builder</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add categories and dishes, set prices, and mark items sold out or time-limited — changes here are what your
        customers see instantly on your live menu.
      </p>
      <MenuBuilder categories={categories} initialItems={items} />
    </div>
  );
}
```

- [ ] **Step 2: Make `MenuBuilder` call the Server Actions**

In `components/dashboard/menu-builder.tsx`, replace the imports (lines 1-15):

```tsx
"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, Clock } from "lucide-react";
import type { MenuCategory, MenuItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FoodImagePlaceholder } from "@/components/storefront/food-image-placeholder";
import { formatMoney } from "@/lib/currency";
```

with:

```tsx
"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, Clock } from "lucide-react";
import type { MenuCategory, MenuItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FoodImagePlaceholder } from "@/components/storefront/food-image-placeholder";
import { formatMoney } from "@/lib/currency";
import { createMenuItem, updateMenuItem, deleteMenuItem } from "@/lib/actions/menu-actions";
```

Then replace `toggleAvailable`, `removeItem`, and `saveDraft` (lines 29-65):

```tsx
  function toggleAvailable(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable: !i.isAvailable } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function openNew(categoryId: string) {
    setEditing({ categoryId, addons: [], isAvailable: true });
  }

  function openEdit(item: MenuItem) {
    setEditing({ ...item });
  }

  function saveDraft() {
    if (!editing || !editing.title || editing.price === undefined) return;
    if (editing.id) {
      setItems((prev) => prev.map((i) => (i.id === editing.id ? ({ ...i, ...editing } as MenuItem) : i)));
    } else {
      const newItem: MenuItem = {
        id: `i-${Date.now()}`,
        categoryId: editing.categoryId,
        title: editing.title!,
        description: editing.description ?? "",
        price: Number(editing.price) || 0,
        imageUrl: null,
        isAvailable: editing.isAvailable ?? true,
        availableFrom: editing.availableFrom,
        availableUntil: editing.availableUntil,
        addons: [],
      };
      setItems((prev) => [...prev, newItem]);
    }
    setEditing(null);
  }
```

with:

```tsx
  const [error, setError] = useState<string | null>(null);

  async function toggleAvailable(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable: !i.isAvailable } : i)));
    const result = await updateMenuItem(id, { isAvailable: !item.isAvailable });
    if ("error" in result) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable: item.isAvailable } : i)));
      setError(result.error);
    }
  }

  async function removeItem(id: string) {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const result = await deleteMenuItem(id);
    if ("error" in result) {
      setItems(previous);
      setError(result.error);
    }
  }

  function openNew(categoryId: string) {
    setEditing({ categoryId, addons: [], isAvailable: true });
  }

  function openEdit(item: MenuItem) {
    setEditing({ ...item });
  }

  async function saveDraft() {
    if (!editing || !editing.title || editing.price === undefined) return;
    setError(null);

    if (editing.id) {
      const result = await updateMenuItem(editing.id, {
        title: editing.title,
        description: editing.description ?? "",
        price: Number(editing.price),
        isAvailable: editing.isAvailable ?? true,
        availableFrom: editing.availableFrom,
        availableUntil: editing.availableUntil,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === result.data.id ? result.data : i)));
    } else {
      const result = await createMenuItem({
        categoryId: editing.categoryId,
        title: editing.title,
        description: editing.description ?? "",
        price: Number(editing.price) || 0,
        isAvailable: editing.isAvailable ?? true,
        availableFrom: editing.availableFrom,
        availableUntil: editing.availableUntil,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setItems((prev) => [...prev, result.data]);
    }
    setEditing(null);
  }
```

Finally, add an error display just above the closing `</div>` of the component's returned JSX — replace:

```tsx
      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
```

with:

```tsx
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 4: Live manual verification**

Run: `npm run dev`, log in as a real owner, open `/dashboard/menu`:
- Confirm the categories/items shown match what's actually in the `menu_categories`/`menu_items` tables for that restaurant in Supabase Studio (not `lib/mock-data.ts`'s Burger House list, unless that owner's real restaurant happens to be seeded with the same names).
- Add a new item, reload the page, confirm it persisted (real Supabase row, not lost on reload — this is the core behavior change from local-state-only).
- Toggle an item's availability, reload, confirm it persisted.
- Delete an item, reload, confirm it's gone.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/menu/page.tsx components/dashboard/menu-builder.tsx
git commit -m "feat: wire menu builder to real Supabase data"
```

---

### Task 6: Order Server Action + wire Overview and Orders pages with Realtime

**Files:**
- Create: `lib/actions/order-actions.ts`
- Modify: `app/dashboard/page.tsx` (currently 48 lines, shown in full above)
- Modify: `app/dashboard/orders/page.tsx` (currently 54 lines, shown in full above)
- Modify: `components/dashboard/order-queue-board.tsx` (currently 75 lines, shown in full above)

**Interfaces:**
- Produces: `advanceOrderStatus(orderId: string, nextStatus: OrderStatus): Promise<ActionResult<Order>>` (this task); `createOrder` is added later, in Task 10, to the same file.
- Consumes: `createServerSupabaseClient`, `mapOrderRow` (Task 2), `getCurrentRestaurant` (Task 2), `getAnalyticsSnapshot` (Task 3), `nextStatus` from `./order-status-badge` (existing, unchanged), `supabase` browser client from `@/lib/supabase/client` (existing, for the Realtime subscription).

- [ ] **Step 1: Create `advanceOrderStatus`**

Create `lib/actions/order-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import type { Order, OrderStatus } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export async function advanceOrderStatus(orderId: string, nextStatus: OrderStatus): Promise<ActionResult<Order>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", orderId)
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to update order" };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { data: mapOrderRow(data) };
}
```

- [ ] **Step 2: Fetch real orders + analytics on the Overview page**

Replace the full contents of `app/dashboard/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { ClipboardList, DollarSign, TrendingUp, Flame } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { OrderQueueBoard } from "@/components/dashboard/order-queue-board";
import { formatMoney } from "@/lib/currency";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { getAnalyticsSnapshot } from "@/lib/analytics";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";

export default async function DashboardOverviewPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const [{ data: orderRows }, analytics] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .not("status", "in", "(completed,cancelled)")
      .order("queue_number", { ascending: true })
      .limit(6),
    getAnalyticsSnapshot(restaurant.id, restaurant.currency),
  ]);

  const orders = (orderRows ?? []).map(mapOrderRow);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s how {restaurant.name} is doing today.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/orders">View all orders</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="Orders today" value={String(analytics.ordersToday)} hint="Since midnight" />
        <StatCard
          icon={DollarSign}
          label="Sales today"
          value={formatMoney(analytics.totalSalesToday, analytics.currency)}
          accent="success"
        />
        <StatCard
          icon={TrendingUp}
          label="Sales this week"
          value={formatMoney(analytics.totalSalesThisWeek, analytics.currency)}
          accent="secondary"
        />
        <StatCard icon={Flame} label="Top item" value={analytics.topItems[0]?.title ?? "—"} hint={analytics.topItems[0] ? `${analytics.topItems[0].count} sold` : "No sales yet"} />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Kitchen queue</h2>
          <span className="text-xs text-muted-foreground">Tap &quot;Advance&quot; as each order moves along</span>
        </div>
        <OrderQueueBoard initialOrders={orders} restaurantId={restaurant.id} limit={6} />
      </div>
    </div>
  );
}
```

Note: the old `hint="+12% vs yesterday"` was a made-up mock number with no real basis — replaced with "Since midnight" (accurate, not fabricated) since there's no "yesterday" comparison computed by `getAnalyticsSnapshot`.

- [ ] **Step 3: Fetch real orders on the Orders page**

Replace the full contents of `app/dashboard/orders/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { OrderQueueBoard } from "@/components/dashboard/order-queue-board";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import { formatMoney } from "@/lib/currency";
import { Card } from "@/components/ui/card";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";

export default async function OrdersPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const { data: orderRows } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("queue_number", { ascending: true });

  const orders = (orderRows ?? []).map(mapOrderRow);
  const completed = orders.filter((o) => o.status === "completed" || o.status === "cancelled");

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Orders &amp; kitchen queue</h1>
      <p className="text-sm text-muted-foreground">
        Active orders show as a numbered queue — advance each one as it&apos;s prepared, dispatched and completed.
      </p>

      <div className="mt-6">
        <OrderQueueBoard initialOrders={orders} restaurantId={restaurant.id} />
      </div>

      {completed.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Completed today</h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {completed.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">#{o.queueNumber}</td>
                    <td className="px-4 py-3">{o.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.items.map((i) => i.title).join(", ")}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(o.total, o.currency)}</td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire `OrderQueueBoard` to the Server Action + Realtime**

Replace the full contents of `components/dashboard/order-queue-board.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MapPin, Store, Utensils } from "lucide-react";
import type { Order } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { OrderStatusBadge, nextStatus } from "./order-status-badge";
import { advanceOrderStatus } from "@/lib/actions/order-actions";
import { supabase } from "@/lib/supabase/client";

const TYPE_ICON = { delivery: MapPin, pickup: Store, table: Utensils };

export function OrderQueueBoard({
  initialOrders,
  restaurantId,
  limit,
}: {
  initialOrders: Order[];
  restaurantId: string;
  limit?: number;
}) {
  const [orders, setOrders] = useState(initialOrders);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as Record<string, unknown>;
            const incoming: Order = {
              id: row.id as string,
              queueNumber: row.queue_number as number,
              restaurantId: row.restaurant_id as string,
              customerName: row.customer_name as string,
              customerPhone: row.customer_phone as string,
              orderType: row.order_type as Order["orderType"],
              tableNumber: (row.table_number as string) ?? undefined,
              address: (row.address as string) ?? undefined,
              items: row.items as Order["items"],
              total: Number(row.total),
              currency: row.currency as Order["currency"],
              status: row.status as Order["status"],
              driver: undefined,
              promoCode: (row.promo_code as string) ?? undefined,
              createdAt: row.created_at as string,
            };
            setOrders((prev) => {
              const exists = prev.some((o) => o.id === incoming.id);
              return exists ? prev.map((o) => (o.id === incoming.id ? incoming : o)) : [...prev, incoming];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const active = orders
    .filter((o) => o.status !== "completed" && o.status !== "cancelled")
    .sort((a, b) => a.queueNumber - b.queueNumber)
    .slice(0, limit);

  async function advance(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const target = nextStatus(order.status);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: target } : o)));
    const result = await advanceOrderStatus(id, target);
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
    }
  }

  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground">No active orders right now — kitchen&apos;s clear.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {active.map((order) => {
        const TypeIcon = TYPE_ICON[order.orderType];
        return (
          <Card key={order.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
                  #{order.queueNumber}
                </span>
                <OrderStatusBadge status={order.status} />
              </div>

              <div>
                <p className="text-sm font-semibold">{order.customerName}</p>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <TypeIcon className="h-3 w-3" />
                  {order.orderType === "table" ? `Table ${order.tableNumber}` : order.orderType === "delivery" ? order.address : "Pickup"}
                </p>
              </div>

              <ul className="flex-1 space-y-1 text-xs text-muted-foreground">
                {order.items.map((i, idx) => (
                  <li key={idx}>
                    {i.quantity}x {i.title}
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-bold">{formatMoney(order.total, order.currency)}</span>
                {order.status !== "out_for_delivery" || order.orderType !== "delivery" ? (
                  <Button size="sm" variant="outline" onClick={() => advance(order.id)} className="gap-1">
                    Advance <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{order.driver?.name}</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 6: Live manual verification**

Run: `npm run dev`, log in as a real owner:
- `/dashboard` and `/dashboard/orders` show real orders for that restaurant (empty state — "No active orders right now" — is expected and correct if no orders exist yet; `06_orders.sql` hasn't necessarily been applied/exercised at this point).
- Click "Advance" on a real order, reload, confirm the new status persisted.
- Open the same restaurant's `/dashboard/orders` in two browser tabs; advance an order's status in one tab and confirm the other tab's queue updates within a couple of seconds without a manual reload (Realtime check). If no real orders exist yet to test this with, insert one manually via Supabase Studio's table editor first.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/order-actions.ts app/dashboard/page.tsx app/dashboard/orders/page.tsx components/dashboard/order-queue-board.tsx
git commit -m "feat: wire dashboard orders/overview to real Supabase data with Realtime updates"
```

---

### Task 7: Settings + staff Server Actions and `TeamSection`

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `lib/actions/settings-actions.ts`
- Create: `lib/actions/staff-actions.ts`
- Modify: `app/dashboard/settings/page.tsx` (currently 20 lines, shown in full above)
- Modify: `components/dashboard/settings-form.tsx` (currently 131 lines, shown in full above)
- Modify: `components/dashboard/team-section.tsx` (currently 130 lines, shown in full above)

**Interfaces:**
- Produces: `updateRestaurantSettings(restaurantId: string, patch: RestaurantSettingsPatch): Promise<ActionResult<Restaurant>>`; `addStaffMember(input: NewStaffInput): Promise<ActionResult<StaffUser>>`, `removeStaffMember(staffUserId: string): Promise<ActionResult<true>>`, `updateStaffRole(staffUserId: string, role: StaffRole): Promise<ActionResult<StaffUser>>`.
- Consumes: `createServerSupabaseClient`, `mapRestaurantRow`, `mapStaffUserRow` (Task 2), `getCurrentRestaurant` (Task 2).

- [ ] **Step 1: Create the service-role admin client**

Create `lib/supabase/admin.ts`:

```ts
// -----------------------------------------------------------------------------
// Service-role Supabase client. Used ONLY by staff-account creation
// (lib/actions/staff-actions.ts) — creating an auth.users row isn't something
// Postgres RLS can gate, so this is the one deliberate exception to "ordinary
// writes use the RLS-scoped server client." Never import this from a
// "use client" file — SUPABASE_SERVICE_ROLE_KEY must never reach the browser.
// -----------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./client";

export function createAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
```

- [ ] **Step 2: Create `updateRestaurantSettings`**

Create `lib/actions/settings-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow } from "@/lib/supabase/mappers";
import type { Restaurant } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export type RestaurantSettingsPatch = Partial<
  Pick<Restaurant, "name" | "whatsappNumber" | "tagline" | "address" | "currency" | "lbpExchangeRate" | "showBothCurrencies">
>;

export async function updateRestaurantSettings(
  restaurantId: string,
  patch: RestaurantSettingsPatch
): Promise<ActionResult<Restaurant>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.whatsappNumber !== undefined) update.whatsapp_number = patch.whatsappNumber;
  if (patch.tagline !== undefined) update.tagline = patch.tagline;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.lbpExchangeRate !== undefined) update.lbp_exchange_rate = patch.lbpExchangeRate;
  if (patch.showBothCurrencies !== undefined) update.show_both_currencies = patch.showBothCurrencies;

  const { data, error } = await supabase.from("restaurants").update(update).eq("id", restaurantId).select().single();

  if (error || !data) return { error: error?.message ?? "Failed to save settings" };
  revalidatePath("/dashboard/settings");
  return { data: mapRestaurantRow(data) };
}
```

- [ ] **Step 3: Create the staff actions**

Create `lib/actions/staff-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapStaffUserRow } from "@/lib/supabase/mappers";
import type { StaffRole, StaffUser } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export interface NewStaffInput {
  restaurantId: string;
  name: string;
  phone: string;
  role: StaffRole;
  email: string;
  password: string;
}

export async function addStaffMember(input: NewStaffInput): Promise<ActionResult<StaffUser>> {
  const admin = createAdminSupabaseClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Failed to create login" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("staff_users")
    .insert({
      restaurant_id: input.restaurantId,
      auth_user_id: created.user.id,
      name: input.name,
      phone: input.phone,
      role: input.role,
    })
    .select()
    .single();

  if (error || !data) {
    // Roll back the just-created login so it isn't left orphaned with no restaurant.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: error?.message ?? "Failed to add team member" };
  }

  revalidatePath("/dashboard/settings");
  return { data: mapStaffUserRow(data) };
}

export async function removeStaffMember(staffUserId: string): Promise<ActionResult<true>> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("staff_users").delete().eq("id", staffUserId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { data: true };
}

export async function updateStaffRole(staffUserId: string, role: StaffRole): Promise<ActionResult<StaffUser>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("staff_users")
    .update({ role })
    .eq("id", staffUserId)
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to update role" };
  revalidatePath("/dashboard/settings");
  return { data: mapStaffUserRow(data) };
}
```

- [ ] **Step 4: Fetch real restaurant + staff on the Settings page**

Replace the full contents of `app/dashboard/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { TeamSection } from "@/components/dashboard/team-section";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapStaffUserRow } from "@/lib/supabase/mappers";

export default async function SettingsPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const { data: staffRows } = await supabase.from("staff_users").select("*").eq("restaurant_id", restaurant.id);
  const staff = (staffRows ?? []).map(mapStaffUserRow);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Business profile, currency display, and your plan.</p>
      <SettingsForm restaurant={restaurant} />
      <div className="mt-6">
        <TeamSection restaurant={restaurant} initialStaff={staff} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `SettingsForm` to `updateRestaurantSettings`**

In `components/dashboard/settings-form.tsx`, replace the import block and component signature (lines 1-20):

```tsx
"use client";

import { useState } from "react";
import type { Restaurant, Currency } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { QRCodeBlock } from "@/components/storefront/qr-code-block";

export function SettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [form, setForm] = useState(restaurant);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof Restaurant>(key: K, value: Restaurant[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }
```

with:

```tsx
"use client";

import { useState } from "react";
import type { Restaurant, Currency } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { QRCodeBlock } from "@/components/storefront/qr-code-block";
import { updateRestaurantSettings } from "@/lib/actions/settings-actions";

export function SettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [form, setForm] = useState(restaurant);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof Restaurant>(key: K, value: Restaurant[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateRestaurantSettings(restaurant.id, {
      name: form.name,
      whatsappNumber: form.whatsappNumber,
      tagline: form.tagline,
      address: form.address,
      currency: form.currency,
      lbpExchangeRate: form.lbpExchangeRate,
      showBothCurrencies: form.showBothCurrencies,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }
```

Then replace the save button block:

```tsx
        <Button onClick={() => setSaved(true)}>Save changes</Button>
        {saved && <p className="text-sm text-success">Saved (demo only — connect Supabase to persist).</p>}
```

with:

```tsx
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && <p className="text-sm text-success">Saved.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
```

- [ ] **Step 6: Add login fields and wire `TeamSection` to the staff actions**

Replace the full contents of `components/dashboard/team-section.tsx`:

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
import { addStaffMember, removeStaffMember, updateStaffRole } from "@/lib/actions/staff-actions";

const ROLE_CAPTION: Record<StaffRole, string> = {
  owner: "Full access, including billing and menu.",
  staff: "Can manage orders and the kitchen queue. Cannot edit the menu, settings, or billing.",
};

export function TeamSection({ restaurant, initialStaff }: { restaurant: Restaurant; initialStaff: StaffUser[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function addMember() {
    if (!name || !phone || !email || !password) return;
    setSubmitting(true);
    setError(null);
    const result = await addStaffMember({ restaurantId: restaurant.id, name, phone, role, email, password });
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStaff((prev) => [...prev, result.data]);
    setName("");
    setPhone("");
    setRole("staff");
    setEmail("");
    setPassword("");
  }

  async function removeMember(id: string) {
    const previous = staff;
    setStaff((prev) => prev.filter((s) => s.id !== id));
    const result = await removeStaffMember(id);
    if ("error" in result) {
      setStaff(previous);
      setError(result.error);
    }
  }

  async function changeRole(id: string, newRole: StaffRole) {
    const previous = staff;
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, role: newRole } : s)));
    const result = await updateStaffRole(id, newRole);
    if ("error" in result) {
      setStaff(previous);
      setError(result.error);
    }
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
            const isOwner = member.role === "owner";
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

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <Label htmlFor="team-phone">Phone</Label>
            <Input id="team-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 7X XXX XXX" />
          </div>
          <div>
            <Label htmlFor="team-email">Login email</Label>
            <Input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@restaurant.com" />
          </div>
          <div>
            <Label htmlFor="team-password">Temporary password</Label>
            <Input
              id="team-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <Label>Role</Label>
            <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
              {(["staff", "owner"] as StaffRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 px-2.5 py-2.5 capitalize transition-colors ${
                    role === r ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <Button onClick={addMember} disabled={!name || !phone || !email || !password || submitting} className="w-full">
              {submitting ? "Adding…" : "Add team member"}
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 8: Live manual verification**

Run: `npm run dev`, log in as a real owner, open `/dashboard/settings`:
- Edit the business name, tagline, currency toggle, and LBP exchange rate; save; reload; confirm all persisted.
- Add a team member with a real email/password; reload; confirm the row appears and persisted. If you're willing to use a `SUPABASE_SERVICE_ROLE_KEY`-configured environment, log out and log in as that new staff account in a separate browser/incognito window to confirm the login actually works and lands on the same restaurant's dashboard. If `SUPABASE_SERVICE_ROLE_KEY` isn't set in this environment, `addStaffMember` will fail with "SUPABASE_SERVICE_ROLE_KEY is not set" — report this as expected given the environment, not a bug, and note that the create/rollback logic was still read-through verified in Step 7.
- Change a staff member's role, reload, confirm it persisted. Remove a staff member, reload, confirm they're gone.

- [ ] **Step 9: Commit**

```bash
git add lib/supabase/admin.ts lib/actions/settings-actions.ts lib/actions/staff-actions.ts app/dashboard/settings/page.tsx components/dashboard/settings-form.tsx components/dashboard/team-section.tsx
git commit -m "feat: wire settings and team management to real Supabase data"
```

---

### Task 8: Wire the Analytics page

**Files:**
- Modify: `app/dashboard/analytics/page.tsx` (currently 15 lines, shown in full above)

**Interfaces:**
- Consumes: `getCurrentRestaurant` (Task 2), `getAnalyticsSnapshot` (Task 3).

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `app/dashboard/analytics/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { getAnalyticsSnapshot } from "@/lib/analytics";

export default async function AnalyticsPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const analytics = await getAnalyticsSnapshot(restaurant.id, restaurant.currency);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Sales trends, peak hours, and your best-selling dishes — no spreadsheets required.
      </p>
      <AnalyticsCharts analytics={analytics} />
    </div>
  );
}
```

`components/dashboard/analytics-charts.tsx` is unchanged — it already takes an `AnalyticsSnapshot` prop and doesn't know or care whether it came from mock data or Supabase.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Live manual verification**

Run: `npm run dev`, log in as a real owner, open `/dashboard/analytics`. Confirm it renders without error — an empty/zeroed chart is correct if that restaurant has no real orders yet; place a real order (once Task 10 is done) and confirm the numbers update on reload.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/analytics/page.tsx
git commit -m "feat: wire analytics page to real Supabase data"
```

---

### Task 9: Storefront reads — real restaurant + menu lookup

**Files:**
- Modify: `lib/menu.ts` (currently 21 lines, shown in full above)
- Modify: `app/[restaurantSlug]/page.tsx` (currently 30 lines, shown in full above)

**Interfaces:**
- Produces: `getMenuSections(restaurantId: string): Promise<MenuSection[]>` (now async — was sync before), `getRestaurantBySlug(slug: string): Promise<Restaurant | null>` (new export here, replacing the mock-data one for this route).
- Consumes: `createServerSupabaseClient`, `mapMenuCategoryRow`, `mapItemAddonRow`, `mapMenuItemRow`, `mapRestaurantRow` (Task 2).

- [ ] **Step 1: Rewrite `lib/menu.ts`**

Replace the full contents of `lib/menu.ts`:

```ts
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuCategoryRow, mapItemAddonRow, mapMenuItemRow, mapRestaurantRow } from "@/lib/supabase/mappers";
import type { MenuCategory, MenuItem, Restaurant } from "./types";

export interface MenuSection {
  category: MenuCategory;
  items: MenuItem[];
}

/**
 * Builds the category -> items structure a template component renders, from
 * the live Supabase project (public-read RLS on menu_categories/menu_items/
 * item_addons — no session required, matches the storefront having no login).
 */
export async function getMenuSections(restaurantId: string): Promise<MenuSection[]> {
  const supabase = createServerSupabaseClient();
  const { data: categoryRows } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });

  const categories = (categoryRows ?? []).map(mapMenuCategoryRow);
  const categoryIds = categories.map((c) => c.id);
  if (categoryIds.length === 0) return [];

  const { data: itemRows } = await supabase.from("menu_items").select("*").in("category_id", categoryIds);
  const itemIds = (itemRows ?? []).map((r) => r.id as string);

  const { data: addonRows } = itemIds.length
    ? await supabase.from("item_addons").select("*").in("item_id", itemIds)
    : { data: [] };

  return categories.map((category) => ({
    category,
    items: (itemRows ?? [])
      .filter((row) => row.category_id === category.id)
      .map((row) => mapMenuItemRow(row, (addonRows ?? []).filter((a) => a.item_id === row.id).map(mapItemAddonRow))),
  }));
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("restaurants").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return mapRestaurantRow(data);
}
```

- [ ] **Step 2: Update the storefront page to use the new async functions**

Replace the full contents of `app/[restaurantSlug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMenuSections, getRestaurantBySlug } from "@/lib/menu";
import { TemplateRenderer } from "@/components/templates";

export function generateMetadata(): Metadata {
  return {};
}

export async function generateMetadata2({
  params,
}: {
  params: { restaurantSlug: string };
}): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) return {};
  return {
    title: `${restaurant.name} — Order online`,
    description: restaurant.tagline,
  };
}

export default async function RestaurantStorefrontPage({ params }: { params: { restaurantSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) notFound();

  const sections = await getMenuSections(restaurant.id);

  return <TemplateRenderer restaurant={restaurant} sections={sections} />;
}
```

Wait — Next.js only recognizes one export literally named `generateMetadata`, and it must be a single function; the stub above (`generateMetadata` returning `{}` plus an unused `generateMetadata2`) is wrong. Use this instead:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMenuSections, getRestaurantBySlug } from "@/lib/menu";
import { TemplateRenderer } from "@/components/templates";

export async function generateMetadata({ params }: { params: { restaurantSlug: string } }): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) return {};
  return {
    title: `${restaurant.name} — Order online`,
    description: restaurant.tagline,
  };
}

export default async function RestaurantStorefrontPage({ params }: { params: { restaurantSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) notFound();

  const sections = await getMenuSections(restaurant.id);

  return <TemplateRenderer restaurant={restaurant} sections={sections} />;
}
```

Note: `generateStaticParams` (which listed all 4 mock restaurant slugs so Next could statically prerender each one at build time) is intentionally dropped — restaurants are no longer a fixed, known-at-build-time list; the route now renders dynamically per request (Next.js's default for an async Server Component reading from a database with no `generateStaticParams`), which is the correct trade-off now that new real restaurants can be created at any time via onboarding.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds. The route `/[restaurantSlug]` should no longer show as statically prerendered (`○`) in the build output's route list — it becomes a dynamic (`ƒ`) route, which is expected per the note above, not a regression.

- [ ] **Step 4: Live manual verification**

Run: `npm run dev`. Visit `/{slug}` for a real restaurant created via onboarding (or one of the 4 seeded demo restaurants, if `04_seed.sql` has been applied) and confirm the menu shown matches the real `menu_categories`/`menu_items` rows in Supabase Studio — then, in Task 5's menu builder for that same restaurant, add/edit an item and confirm it shows up here on reload (the core promise from `app/dashboard/menu/page.tsx`'s own copy: "changes here are what your customers see instantly on your live menu").

- [ ] **Step 5: Commit**

```bash
git add lib/menu.ts "app/[restaurantSlug]/page.tsx"
git commit -m "feat: wire storefront restaurant/menu lookup to real Supabase data"
```

---

### Task 10: Checkout writes a real order

**Files:**
- Modify: `lib/actions/order-actions.ts` (adding to the file from Task 6)
- Modify: `components/storefront/cart-drawer.tsx` (currently 219 lines, shown in full above)
- Modify: `components/templates/fast-food-template.tsx`, `components/templates/bakery-template.tsx`, `components/templates/fine-dining-template.tsx`, `components/templates/cafe-template.tsx` (one line each)

**Interfaces:**
- Produces (added to `lib/actions/order-actions.ts`): `createOrder(input: CreateOrderInput): Promise<ActionResult<{ id: string; queueNumber: number }>>`.
- Consumes: `createServerSupabaseClient` (Task 2); calls the `create_order` RPC by name with the ten parameter names from Task 1.

- [ ] **Step 1: Add `createOrder` to `lib/actions/order-actions.ts`**

Append to the end of `lib/actions/order-actions.ts` (after `advanceOrderStatus`), and add `OrderLineItem`, `Currency` to the existing type import line at the top:

Replace:

```ts
import type { Order, OrderStatus } from "@/lib/types";
```

with:

```ts
import type { Order, OrderStatus, OrderLineItem, Currency } from "@/lib/types";
```

Then append at the end of the file:

```ts

export interface CreateOrderInput {
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  orderType: "delivery" | "pickup" | "table";
  tableNumber?: string;
  address?: string;
  items: OrderLineItem[];
  total: number;
  currency: Currency;
  promoCode?: string;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<ActionResult<{ id: string; queueNumber: number }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_restaurant_id: input.restaurantId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_order_type: input.orderType,
    p_table_number: input.tableNumber ?? null,
    p_address: input.address ?? null,
    p_items: input.items,
    p_total: input.total,
    p_currency: input.currency,
    p_promo_code: input.promoCode ?? null,
  });

  if (error || !data) return { error: error?.message ?? "Failed to place order" };
  const row = data as unknown as { id: string; queue_number: number };
  return { data: { id: row.id, queueNumber: row.queue_number } };
}
```

- [ ] **Step 2: Call `createOrder` from checkout**

In `components/storefront/cart-drawer.tsx`, replace the import block and props (lines 1-26):

```tsx
"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "./cart-provider";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { formatMoney } from "@/lib/currency";
import { buildWhatsAppLink, buildWhatsAppOrderMessage } from "@/lib/whatsapp";
import type { Currency } from "@/lib/types";

type OrderType = "delivery" | "pickup" | "table";

export function CartDrawer({
  restaurantName,
  whatsappNumber,
  currency,
}: {
  restaurantName: string;
  whatsappNumber: string;
  currency: Currency;
}) {
  const { lines, subtotal, itemCount, updateQuantity, isOpen, setIsOpen, clear } = useCart();
  const { t } = useLocale();
  const [step, setStep] = useState<"cart" | "checkout" | "done">("cart");
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [tableNumber, setTableNumber] = useState("");

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) setStep("cart");
  }

  function handleSubmitOrder() {
    const message = buildWhatsAppOrderMessage(
      {
        items: lines.map((l) => ({
          itemId: l.itemId,
          title: l.title,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          addons: l.addons.map((a) => a.name),
        })),
        total: subtotal,
        currency,
        customerName: name || "Guest",
        customerPhone: phone,
        orderType,
        tableNumber,
        address,
      },
      restaurantName
    );
    const link = buildWhatsAppLink(whatsappNumber, message);
    if (typeof window !== "undefined") window.open(link, "_blank", "noopener,noreferrer");
    setStep("done");
  }
```

with:

```tsx
"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "./cart-provider";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { formatMoney } from "@/lib/currency";
import { buildWhatsAppLink, buildWhatsAppOrderMessage } from "@/lib/whatsapp";
import { createOrder } from "@/lib/actions/order-actions";
import type { Currency } from "@/lib/types";

type OrderType = "delivery" | "pickup" | "table";

export function CartDrawer({
  restaurantId,
  restaurantName,
  whatsappNumber,
  currency,
}: {
  restaurantId: string;
  restaurantName: string;
  whatsappNumber: string;
  currency: Currency;
}) {
  const { lines, subtotal, itemCount, updateQuantity, isOpen, setIsOpen, clear } = useCart();
  const { t } = useLocale();
  const [step, setStep] = useState<"cart" | "checkout" | "done">("cart");
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) setStep("cart");
  }

  async function handleSubmitOrder() {
    setSubmitting(true);
    const orderItems = lines.map((l) => ({
      itemId: l.itemId,
      title: l.title,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      addons: l.addons.map((a) => a.name),
    }));

    const message = buildWhatsAppOrderMessage(
      {
        items: orderItems,
        total: subtotal,
        currency,
        customerName: name || "Guest",
        customerPhone: phone,
        orderType,
        tableNumber,
        address,
      },
      restaurantName
    );

    // The wa.me link is today's real order record for the restaurant — it
    // must open even if the database write below fails, so a Supabase outage
    // never blocks a customer's order.
    const link = buildWhatsAppLink(whatsappNumber, message);
    if (typeof window !== "undefined") window.open(link, "_blank", "noopener,noreferrer");

    const result = await createOrder({
      restaurantId,
      customerName: name || "Guest",
      customerPhone: phone,
      orderType,
      tableNumber: orderType === "table" ? tableNumber : undefined,
      address: orderType === "delivery" ? address : undefined,
      items: orderItems,
      total: subtotal,
      currency,
    });
    setSubmitting(false);
    if ("data" in result) setPlacedOrderId(result.data.id);
    setStep("done");
  }
```

- [ ] **Step 3: Update the "Place order" button and "done" step to use `submitting`/`placedOrderId`**

Replace:

```tsx
            <Button size="lg" onClick={handleSubmitOrder} disabled={!name || !phone} className="w-full">
              {t("placeOrder")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("previewNotice")}</p>
          </div>
        )}

        {step === "done" && (
          <div className="mt-8 flex flex-1 flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <ShoppingBag className="h-7 w-7 text-success" />
            </div>
            <p className="font-medium">{t("orderPlaced")}</p>
            <p className="text-xs text-muted-foreground">{t("previewNotice")}</p>
            <Button
              variant="outline"
              onClick={() => {
                clear();
                setStep("cart");
                setIsOpen(false);
              }}
            >
              Close
            </Button>
          </div>
        )}
```

with:

```tsx
            <Button size="lg" onClick={handleSubmitOrder} disabled={!name || !phone || submitting} className="w-full">
              {submitting ? "Placing…" : t("placeOrder")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("previewNotice")}</p>
          </div>
        )}

        {step === "done" && (
          <div className="mt-8 flex flex-1 flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <ShoppingBag className="h-7 w-7 text-success" />
            </div>
            <p className="font-medium">{t("orderPlaced")}</p>
            {placedOrderId && (
              <a href={`/order/${placedOrderId}`} className="text-sm text-primary underline">
                Track your order
              </a>
            )}
            <p className="text-xs text-muted-foreground">{t("previewNotice")}</p>
            <Button
              variant="outline"
              onClick={() => {
                clear();
                setStep("cart");
                setPlacedOrderId(null);
                setIsOpen(false);
              }}
            >
              Close
            </Button>
          </div>
        )}
```

Note: `placedOrderId` is only set when `createOrder` succeeds (`"data" in result`) — if it fails (e.g. `06_orders.sql` not yet applied to the live project), `placedOrderId` stays `null`, so the "Track your order" link simply doesn't render, and the customer still sees their WhatsApp message go out. This is the "Checkout when Supabase is unreachable" behavior from the design spec.

- [ ] **Step 4: Pass `restaurantId` from all four templates**

In each of the four files below, replace the one line:

```tsx
      <CartDrawer restaurantName={restaurant.name} whatsappNumber={restaurant.whatsappNumber} currency={restaurant.currency} />
```

with:

```tsx
      <CartDrawer restaurantId={restaurant.id} restaurantName={restaurant.name} whatsappNumber={restaurant.whatsappNumber} currency={restaurant.currency} />
```

Apply this in:
- `components/templates/fast-food-template.tsx` (line 87)
- `components/templates/bakery-template.tsx` (line 86)
- `components/templates/cafe-template.tsx` (line 78)
- `components/templates/fine-dining-template.tsx` (line 52)

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 6: Live manual verification (only fully works once `06_orders.sql` from Task 1 is applied to the live project)**

Run: `npm run dev`, open a real restaurant's storefront (`/{slug}`), add an item to the cart, go through checkout with a test name/phone, and place the order.
- If `06_orders.sql` **has** been applied: confirm a new row appears in `orders` in Supabase Studio with the right `restaurant_id`, `items`, `total`, and a `queue_number` that's one higher than that restaurant's previous highest order; confirm the "Track your order" link appears and goes to `/order/{that id}`; confirm the WhatsApp tab still opened as before.
- If `06_orders.sql` **has not** been applied yet: confirm the WhatsApp tab still opens (unblocked) and no "Track your order" link appears (expected — `createOrder` fails cleanly with "could not find function"). Report this explicitly as expected given the migration hasn't been applied, not a bug.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/order-actions.ts components/storefront/cart-drawer.tsx components/templates/fast-food-template.tsx components/templates/bakery-template.tsx components/templates/cafe-template.tsx components/templates/fine-dining-template.tsx
git commit -m "feat: write real orders from storefront checkout"
```

---

### Task 11: Order tracking page reads real data

**Files:**
- Modify: `app/order/[orderId]/page.tsx` (currently 67 lines, shown in full above)

**Interfaces:**
- Consumes: `createServerSupabaseClient`, `mapOrderRow`, `mapRestaurantRow` (Task 2).

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `app/order/[orderId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Truck } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow, mapRestaurantRow } from "@/lib/supabase/mappers";
import { OrderStatusTimeline } from "@/components/storefront/order-status-timeline";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";

export default async function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", params.orderId).maybeSingle();
  if (!orderRow) notFound();
  const order = mapOrderRow(orderRow);

  const { data: restaurantRow } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", order.restaurantId)
    .maybeSingle();
  const restaurant = restaurantRow ? mapRestaurantRow(restaurantRow) : null;

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-md">
        <Card className="mb-5 p-5 text-center">
          <p className="text-sm text-muted-foreground">Order #{order.queueNumber}</p>
          <h1 className="text-xl font-bold">{restaurant?.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{order.items.map((i) => `${i.quantity}x ${i.title}`).join(", ")}</p>
          <p className="mt-2 text-lg font-extrabold">{formatMoney(order.total, order.currency)}</p>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0">
            <OrderStatusTimeline status={order.status} />
          </CardContent>
        </Card>

        {order.driver && (
          <Card className="mt-5 flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{order.driver.name}</p>
                <p className="text-xs text-muted-foreground">Your driver</p>
              </div>
            </div>
            <Button size="sm" variant="outline" asChild>
              <a href={`tel:${order.driver.phone}`} className="gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            </Button>
          </Card>
        )}

        {restaurant && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link href={`/${restaurant.slug}`} className="underline">
              Back to menu
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
```

Note: the old mock version fell back to a demo order (`orders[0]`) when the id wasn't found, with a "Demo preview" banner — this is dropped in favor of a real 404 (`notFound()`), since there's no longer a meaningful mock fallback once orders are real; an unknown order id now correctly means "this order doesn't exist."

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Live manual verification**

Run: `npm run dev`. Visit `/order/{a real order id}` (from Task 10's checkout test, or any row's `id` in Supabase Studio) and confirm it renders the correct restaurant name, items, total, and status. Visit `/order/does-not-exist` and confirm it renders Next.js's 404 page instead of a stale mock fallback.

- [ ] **Step 4: Commit**

```bash
git add "app/order/[orderId]/page.tsx"
git commit -m "feat: wire order tracking page to real Supabase data"
```

---

### Task 12: Update `SETUP_TODO.md` and `README.md`

**Files:**
- Modify: `SETUP_TODO.md` (currently 107 lines)
- Modify: `README.md` (currently 97 lines)

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Mark `SETUP_TODO.md` item 1.7 done and add the new migration**

The relevant lines currently read:

```md
6. Real login/signup now works: visit `/onboarding` to create your first
   real restaurant + owner account, or run
   `node --env-file=.env.local scripts/seed-staff-logins.mjs` (after also
   filling in `SUPABASE_SERVICE_ROLE_KEY`) to create real logins for the 7
   demo staff members already seeded in `04_seed.sql` — that script prints
   each email and the shared demo password when it finishes.
7. Swap the mock reads in `lib/mock-data.ts` / `lib/menu.ts` for real Supabase
   queries — every place that needs this is marked with a
   `// TODO(supabase):` comment. `/dashboard`'s displayed data (menu, orders,
   analytics, settings) still shows mock data regardless of who's logged in
   until this happens — that's the next sub-project (owner-side data
   wiring), not this one.
```

Replace with:

```md
6. Real login/signup now works: visit `/onboarding` to create your first
   real restaurant + owner account, or run
   `node --env-file=.env.local scripts/seed-staff-logins.mjs` (after also
   filling in `SUPABASE_SERVICE_ROLE_KEY`) to create real logins for the 7
   demo staff members already seeded in `04_seed.sql` — that script prints
   each email and the shared demo password when it finishes.
7. Also paste and run `supabase/sql/06_orders.sql` — adds the `create_order`
   RPC that storefront checkout calls to write real orders with a race-free
   per-restaurant queue number.
8. `/dashboard` (menu, orders, analytics, settings, team) and the storefront
   (menu display, checkout, order tracking) now read and write this real
   database — every owner sees and edits their own restaurant's actual data,
   not `lib/mock-data.ts`.
```

- [ ] **Step 2: Update `README.md`'s Status and Known limitations sections**

The "Status" section currently reads (lines 8-17):

```md
## Status

Frontend + a live Supabase backend for auth (real login/signup) — but
`/dashboard`'s displayed data (menu, orders, analytics, settings) is still
**mock data** regardless of who's logged in. `/login`, `/onboarding`,
`/dashboard`, and `/admin` all require `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` to be set (see `.env.local` / `.env.example`)
— without them those routes fail to build or render. See `SETUP_TODO.md`
for the remaining steps (WhatsApp Cloud API, a domain, swapping the
dashboard's own data source) before this is fully live for real customers.
```

Replace with:

```md
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
```

The "Known limitations" section currently reads (lines 86-97):

```md
## Known limitations (by design, for now)

- No real database for the dashboard — every write there (adding a menu
  item, advancing an order, saving settings) only updates in-memory React
  state and resets on reload. Auth (login/signup) IS backed by a real
  Supabase database — see the next bullet.
- Real login/signup exists (`/login`, `/onboarding`), and `/dashboard`/`/admin`
  are gated behind it — but `/dashboard` still shows the same mock data
  regardless of who's logged in; wiring it to the logged-in user's actual
  restaurant is the next piece of work (owner-side data wiring).
- Menu item photos are CSS/icon placeholders, not real photos — see
  SETUP_TODO.md item 5 for why that's actually correct for now.
```

Replace with:

```md
## Known limitations (by design, for now)

- `/admin` (the platform admin panel) still shows mock data — every RLS
  policy scopes to a restaurant's own staff, with no cross-tenant read path
  yet for the admin panel; that's a future sub-project.
- No staff self-service invite flow — the owner creates each team member's
  login directly in Settings (email + a temporary password they share with
  that person), rather than sending an invite link.
- Menu item photos are CSS/icon placeholders, not real photos — see
  SETUP_TODO.md item 5 for why that's actually correct for now.
- No rate-limiting on order creation — a very small, unhandled
  business-logic edge case (not a security bug; RLS still scopes correctly),
  acceptable for now.
```

- [ ] **Step 3: Commit**

```bash
git add SETUP_TODO.md README.md
git commit -m "docs: document owner-side data wiring in SETUP_TODO and README"
```

---

### Task 13: Final build verification and live smoke test

**Files:**
- None created or modified — this task only verifies.

**Interfaces:**
- None.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with no errors. Route list should show `app/[restaurantSlug]` and `app/order/[orderId]` as dynamic (`ƒ`), not static (`○`) — expected per Task 9's note.

- [ ] **Step 2: Full live smoke test**

Run: `npm run dev`, with a real owner login available (from a prior sub-project's seeded staff or a fresh `/onboarding` signup) and both `05_auth.sql` and `06_orders.sql` applied to the live project:

1. Log in; confirm the sidebar shows the real restaurant name, not "Burger House" (unless that really is the logged-in owner's restaurant).
2. `/dashboard` shows real order counts/sales (zero is correct if no orders exist yet) and a real (possibly empty) kitchen queue.
3. `/dashboard/menu`: add an item, confirm it appears on the live storefront at `/{slug}` after reload.
4. Place a real order through `/{slug}` checkout; confirm it appears on `/dashboard` and `/dashboard/orders` without a manual reload (Realtime); advance its status and confirm the storefront's `/order/{id}` page reflects the new status on reload.
5. `/dashboard/settings`: edit the profile, add a team member, confirm both persist across reload.
6. `/dashboard/analytics`: confirm it reflects the order placed in step 4.
7. If a second real restaurant/owner is available, confirm that owner cannot see or edit the first restaurant's menu, orders, settings, or staff (RLS boundary check).

Report exactly which of these steps could be run live (depends on whether `06_orders.sql` was applied, and whether a second test restaurant exists) versus which were only read-through verified, so the user knows the actual verification coverage.

- [ ] **Step 3: No commit** — this task is verification-only, nothing to add.

## Self-Review Notes

- **Spec coverage:** Task 1 covers the `create_order` RPC. Task 2 covers the server client, mappers, and `getCurrentRestaurant()` (Architecture section). Task 3 covers the shared analytics helper. Tasks 4-5 cover the menu builder. Task 6 covers Overview + Orders + Realtime. Task 7 covers Settings + Team (including the service-role staff-creation path and its rollback-on-failure error handling). Task 8 covers Analytics. Task 9 covers the storefront menu/restaurant read side. Task 10 covers checkout's real order write (including the "WhatsApp link still opens if the DB write fails" requirement). Task 11 covers order tracking. Task 12 covers Docs. Task 13 covers the spec's verification plan end-to-end.
- **Placeholder scan:** no TBD/TODO; every step has complete, literal code. One self-caught issue: Task 9's first draft of the storefront page accidentally split `generateMetadata` into two functions (a Next.js App Router convention violation — only one `generateMetadata` export is recognized) — corrected in the same step to a single async function, with the mistake and correction both shown so an implementer reading linearly understands why.
- **Type consistency:** `ActionResult<T>` (`{ error: string } | { data: T }`) is defined identically (and separately, matching this codebase's lack of a shared barrel file) in `menu-actions.ts`, `order-actions.ts`, `settings-actions.ts`, and `staff-actions.ts`. `mapOrderRow`, `mapRestaurantRow`, `mapMenuItemRow`, `mapMenuCategoryRow`, `mapItemAddonRow`, `mapStaffUserRow` (Task 2) are imported with identical names and signatures everywhere they're used (Tasks 3, 5, 6, 7, 9, 11). `OrderQueueBoard`'s new `restaurantId` prop is passed consistently from both call sites (Task 6, Overview and Orders pages). `CartDrawer`'s new `restaurantId` prop is passed consistently from all four template files (Task 10).
- **Caught during self-review:** the original brainstormed design's phrase "category/item CRUD" for the menu builder was narrowed to item-only CRUD (Task 4/5) after reading `menu-builder.tsx` in full — the actual UI has no "add category" control, so building one would be a new feature beyond "wire existing UI to real data," not part of this plan's scope. Also caught: a naive `SELECT MAX(queue_number)+1` for order numbering (mentioned loosely in the design doc) would race under concurrent checkouts and can't use `FOR UPDATE` with an aggregate — Task 1 uses an atomic per-restaurant counter column instead.
