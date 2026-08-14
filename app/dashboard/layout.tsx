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
