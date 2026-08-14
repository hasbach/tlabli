import { redirect } from "next/navigation";
import { ClipboardList, DollarSign, TrendingUp, Flame } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { OrderQueueBoard } from "@/components/dashboard/order-queue-board";
import { formatMoney } from "@/lib/currency";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { getAnalyticsSnapshot } from "@/lib/analytics";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";

export default async function DashboardOverviewPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const [{ data: orderRows }, analytics] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .not("status", "in", "(completed,cancelled)")
      .order("queue_number", { ascending: true })
      .limit(6),
    getAnalyticsSnapshot(restaurant.id, restaurant.currency),
  ]);

  const orders = (orderRows ?? []).map(mapOrderRow);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s how {restaurant.name} is doing today.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/orders">View all orders</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="Orders today" value={String(analytics.ordersToday)} hint="Since midnight" />
        <StatCard
          icon={DollarSign}
          label="Sales today"
          value={formatMoney(analytics.totalSalesToday, analytics.currency)}
          accent="success"
        />
        <StatCard
          icon={TrendingUp}
          label="Sales this week"
          value={formatMoney(analytics.totalSalesThisWeek, analytics.currency)}
          accent="secondary"
        />
        <StatCard icon={Flame} label="Top item" value={analytics.topItems[0]?.title ?? "—"} hint={analytics.topItems[0] ? `${analytics.topItems[0].count} sold` : "No sales yet"} />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Kitchen queue</h2>
          <span className="text-xs text-muted-foreground">Tap &quot;Advance&quot; as each order moves along</span>
        </div>
        <OrderQueueBoard initialOrders={orders} restaurantId={restaurant.id} limit={6} />
      </div>
    </div>
  );
}
