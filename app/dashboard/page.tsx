import { ClipboardList, DollarSign, TrendingUp, Flame } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { OrderQueueBoard } from "@/components/dashboard/order-queue-board";
import { orders, analytics } from "@/lib/mock-data";
import { formatMoney } from "@/lib/currency";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardOverviewPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s how Burger House is doing today.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/orders">View all orders</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="Orders today" value={String(analytics.ordersToday)} hint="+12% vs yesterday" />
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
        <StatCard icon={Flame} label="Top item" value={analytics.topItems[0]?.title ?? "—"} hint={`${analytics.topItems[0]?.count} sold`} />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Kitchen queue</h2>
          <span className="text-xs text-muted-foreground">Tap &quot;Advance&quot; as each order moves along</span>
        </div>
        <OrderQueueBoard initialOrders={orders} limit={6} />
      </div>
    </div>
  );
}
