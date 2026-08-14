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
