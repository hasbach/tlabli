import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { TeamSection } from "@/components/dashboard/team-section";
import { DriversSection } from "@/components/dashboard/drivers-section";
import { WhatsAppSettingsForm } from "@/components/dashboard/whatsapp-settings-form";
import { PrinterSettingsForm } from "@/components/dashboard/printer-settings-form";
import { BrandingSettingsForm } from "@/components/dashboard/branding-settings-form";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapDriverRow, mapStaffUserRow, mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";

export default async function SettingsPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const startOfMonthISO = beirutStartOfMonth(new Date()).toISOString();

  const [{ data: staffRows }, { data: whatsappSettingsRow }, { count: sentThisMonth }, { data: driverRows }, { data: assignedRows }] =
    await Promise.all([
      supabase.from("staff_users").select("*").eq("restaurant_id", restaurant.id),
      supabase.from("whatsapp_settings").select("*").eq("restaurant_id", restaurant.id).maybeSingle(),
      supabase
        .from("whatsapp_message_log")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id)
        .eq("status", "sent")
        .gte("created_at", startOfMonthISO),
      supabase.from("drivers").select("*").eq("restaurant_id", restaurant.id).order("name"),
      supabase
        .from("orders")
        .select("driver_id")
        .eq("restaurant_id", restaurant.id)
        .not("driver_id", "is", null)
        .not("status", "in", "(completed,cancelled)"),
    ]);

  const staff = (staffRows ?? []).map(mapStaffUserRow);
  const whatsappSettings = whatsappSettingsRow ? mapWhatsAppSettingsRow(whatsappSettingsRow) : null;
  const drivers = (driverRows ?? []).map(mapDriverRow);
  const activeOrderCounts: Record<string, number> = {};
  for (const row of assignedRows ?? []) {
    const id = row.driver_id as string;
    activeOrderCounts[id] = (activeOrderCounts[id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Business profile, currency display, and your plan.</p>
      <SettingsForm restaurant={restaurant} />
      <div className="mt-6">
        <BrandingSettingsForm restaurant={restaurant} />
      </div>
      <div className="mt-6">
        <WhatsAppSettingsForm restaurant={restaurant} initialSettings={whatsappSettings} sentThisMonth={sentThisMonth ?? 0} />
      </div>
      <div className="mt-6">
        <PrinterSettingsForm restaurant={restaurant} />
      </div>
      <div className="mt-6">
        <TeamSection restaurant={restaurant} initialStaff={staff} />
      </div>
      <div id="drivers" className="mt-6 scroll-mt-6">
        <DriversSection restaurant={restaurant} initialDrivers={drivers} activeOrderCounts={activeOrderCounts} />
      </div>
    </div>
  );
}
