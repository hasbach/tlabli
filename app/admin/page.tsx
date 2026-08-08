import { restaurants, subscriptions } from "@/lib/mock-data";
import { TenantTable } from "@/components/admin/tenant-table";

export default function AdminPage() {
  // TODO(supabase): replace mock restaurants/subscriptions with a real query.
  // The platform-admin permission check now exists (middleware.ts + PLATFORM_ADMIN_EMAILS).
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
