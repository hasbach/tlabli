import { redirect } from "next/navigation";
import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { getAnalyticsSnapshot } from "@/lib/analytics";

export default async function AnalyticsPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const analytics = await getAnalyticsSnapshot(restaurant.id, restaurant.currency);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Sales trends, peak hours, and your best-selling dishes — no spreadsheets required.
      </p>
      <AnalyticsCharts analytics={analytics} />
    </div>
  );
}
