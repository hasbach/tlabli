import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentRestaurant();
  if (!current) {
    // An authenticated session with no matching staff_users row (e.g. a
    // removed team member) must not linger — /login's own effect redirects
    // any authenticated session straight back to /dashboard, which would
    // otherwise trap the user in a redirect loop with no way to log out.
    const supabase = createServerSupabaseClient();
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
