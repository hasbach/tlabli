import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import type { AnalyticsSnapshot, Currency } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAnalyticsSnapshot(restaurantId: string, currency: Currency): Promise<AnalyticsSnapshot> {
  const supabase = createServerSupabaseClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: true });

  const empty: AnalyticsSnapshot = {
    ordersToday: 0,
    ordersThisWeek: 0,
    totalSalesToday: 0,
    totalSalesThisWeek: 0,
    currency,
    topItems: [],
    salesTrend: [],
    peakHours: [],
  };
  if (error || !data) return empty;

  const orders = data.map(mapOrderRow).filter((o) => o.status !== "cancelled");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const ordersToday = orders.filter((o) => new Date(o.createdAt) >= startOfToday);
  const totalSalesToday = ordersToday.reduce((sum, o) => sum + o.total, 0);
  const totalSalesThisWeek = orders.reduce((sum, o) => sum + o.total, 0);

  const itemCounts = new Map<string, number>();
  for (const o of orders) {
    for (const line of o.items) {
      itemCounts.set(line.title, (itemCounts.get(line.title) ?? 0) + line.quantity);
    }
  }
  const topItems = [...itemCounts.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const trendByDay = new Map<string, number>();
  for (const o of orders) {
    const day = new Date(o.createdAt).toLocaleDateString("en-US", { weekday: "short" });
    trendByDay.set(day, (trendByDay.get(day) ?? 0) + o.total);
  }
  const salesTrend = [...trendByDay.entries()].map(([date, sales]) => ({ date, sales }));

  const hourCounts = new Map<string, number>();
  for (const o of ordersToday) {
    const hour = new Date(o.createdAt)
      .toLocaleTimeString("en-US", { hour: "numeric" })
      .toLowerCase()
      .replace(" ", "");
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const peakHours = [...hourCounts.entries()].map(([hour, orders]) => ({ hour, orders }));

  return {
    ordersToday: ordersToday.length,
    ordersThisWeek: orders.length,
    totalSalesToday,
    totalSalesThisWeek,
    currency,
    topItems,
    salesTrend,
    peakHours,
  };
}
