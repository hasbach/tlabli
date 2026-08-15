import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import { beirutStartOfDay, beirutStartOfDaysAgo, beirutWeekdayShort, beirutHourLabel } from "@/lib/beirut-time";
import type { AnalyticsSnapshot, Currency } from "@/lib/types";

export async function getAnalyticsSnapshot(restaurantId: string, currency: Currency): Promise<AnalyticsSnapshot> {
  const supabase = createServerSupabaseClient();
  const now = new Date();
  // Beirut midnight 6 days ago through now = exactly 7 distinct calendar
  // days, so the same weekday name never buckets two different days.
  const sevenDaysAgo = beirutStartOfDaysAgo(6, now).toISOString();

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
  const startOfToday = beirutStartOfDay(now);

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
    const day = beirutWeekdayShort(new Date(o.createdAt));
    trendByDay.set(day, (trendByDay.get(day) ?? 0) + o.total);
  }
  const salesTrend = [...trendByDay.entries()].map(([date, sales]) => ({ date, sales }));

  const hourCounts = new Map<string, number>();
  for (const o of ordersToday) {
    const hour = beirutHourLabel(new Date(o.createdAt));
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
