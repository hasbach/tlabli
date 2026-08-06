import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { analytics } from "@/lib/mock-data";

export default function AnalyticsPage() {
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
