import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentRestaurant();
  if (!current) {
    const supabase = createServerSupabaseClient();

    // A platform admin has no staff_users row by design (see
    // supabase/sql/07_admin.sql) — send them to /admin instead of treating
    // this like an orphaned session.
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (isAdmin) redirect("/admin");

    // Otherwise this is an authenticated session with no matching staff_users
    // row (e.g. a removed team member) that must not linger — /login's own
    // effect redirects any authenticated session straight back to
    // /dashboard, which would otherwise trap the user in a redirect loop
    // with no way to log out.
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar restaurant={current.restaurant} />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</main>
    </div>
  );
}
