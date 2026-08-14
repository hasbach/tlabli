import { redirect } from "next/navigation";
import { OrderQueueBoard } from "@/components/dashboard/order-queue-board";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import { formatMoney } from "@/lib/currency";
import { Card } from "@/components/ui/card";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";

export default async function OrdersPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const { data: orderRows } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("queue_number", { ascending: true });

  const orders = (orderRows ?? []).map(mapOrderRow);
  const completed = orders.filter((o) => o.status === "completed" || o.status === "cancelled");

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Orders &amp; kitchen queue</h1>
      <p className="text-sm text-muted-foreground">
        Active orders show as a numbered queue — advance each one as it&apos;s prepared, dispatched and completed.
      </p>

      <div className="mt-6">
        <OrderQueueBoard initialOrders={orders} restaurantId={restaurant.id} />
      </div>

      {completed.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Completed today</h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {completed.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">#{o.queueNumber}</td>
                    <td className="px-4 py-3">{o.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.items.map((i) => i.title).join(", ")}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(o.total, o.currency)}</td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
