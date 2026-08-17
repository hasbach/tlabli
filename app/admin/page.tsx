import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow, mapSubscriptionRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";
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

  const startOfMonthISO = beirutStartOfMonth(new Date()).toISOString();

  const [
    { data: restaurantRows, error: restaurantsError },
    { data: subscriptionRows, error: subscriptionsError },
    { data: whatsappLogRows },
  ] = await Promise.all([
    supabase.from("restaurants").select("*").order("name"),
    supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
    supabase.from("whatsapp_message_log").select("restaurant_id").eq("status", "sent").gte("created_at", startOfMonthISO),
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

  const whatsappUsageByRestaurant: Record<string, number> = {};
  for (const row of whatsappLogRows ?? []) {
    const id = row.restaurant_id as string;
    whatsappUsageByRestaurant[id] = (whatsappUsageByRestaurant[id] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Restaurants</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        All tenants on the platform. Manage plan, billing status, and payment confirmation.
      </p>
      <TenantTable
        initialRestaurants={restaurants}
        initialSubscriptions={subscriptions}
        whatsappUsageByRestaurant={whatsappUsageByRestaurant}
      />
    </div>
  );
}
