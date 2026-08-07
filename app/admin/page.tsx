import { restaurants, subscriptions } from "@/lib/mock-data";
import { TenantTable } from "@/components/admin/tenant-table";

export default function AdminPage() {
  // TODO(supabase): replace mock restaurants/subscriptions with a real query,
  // and gate this route behind a platform-admin permission check once auth exists.
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
