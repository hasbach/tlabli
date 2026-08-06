import { SettingsForm } from "@/components/dashboard/settings-form";
import { restaurants } from "@/lib/mock-data";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Business profile, currency display, and your plan.</p>
      <SettingsForm restaurant={restaurants[0]} />
    </div>
  );
}
