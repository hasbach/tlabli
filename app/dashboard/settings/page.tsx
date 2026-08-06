import { SettingsForm } from "@/components/dashboard/settings-form";
import { TeamSection } from "@/components/dashboard/team-section";
import { restaurants, staffUsers } from "@/lib/mock-data";

export default function SettingsPage() {
  const restaurant = restaurants[0];
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Business profile, currency display, and your plan.</p>
      <SettingsForm restaurant={restaurant} />
      <div className="mt-6">
        <TeamSection
          restaurant={restaurant}
          initialStaff={staffUsers.filter((s) => s.restaurantId === restaurant.id)}
        />
      </div>
    </div>
  );
}
