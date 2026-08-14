"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MapPin, Store, Utensils } from "lucide-react";
import type { Order } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { OrderStatusBadge, nextStatus } from "./order-status-badge";
import { advanceOrderStatus } from "@/lib/actions/order-actions";
import { supabase } from "@/lib/supabase/client";

const TYPE_ICON = { delivery: MapPin, pickup: Store, table: Utensils };

export function OrderQueueBoard({
  initialOrders,
  restaurantId,
  limit,
}: {
  initialOrders: Order[];
  restaurantId: string;
  limit?: number;
}) {
  const [orders, setOrders] = useState(initialOrders);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as Record<string, unknown>;
            const incoming: Order = {
              id: row.id as string,
              queueNumber: row.queue_number as number,
              restaurantId: row.restaurant_id as string,
              customerName: row.customer_name as string,
              customerPhone: row.customer_phone as string,
              orderType: row.order_type as Order["orderType"],
              tableNumber: (row.table_number as string) ?? undefined,
              address: (row.address as string) ?? undefined,
              items: row.items as Order["items"],
              total: Number(row.total),
              currency: row.currency as Order["currency"],
              status: row.status as Order["status"],
              driver: undefined,
              promoCode: (row.promo_code as string) ?? undefined,
              createdAt: row.created_at as string,
            };
            setOrders((prev) => {
              const exists = prev.some((o) => o.id === incoming.id);
              return exists ? prev.map((o) => (o.id === incoming.id ? incoming : o)) : [...prev, incoming];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const active = orders
    .filter((o) => o.status !== "completed" && o.status !== "cancelled")
    .sort((a, b) => a.queueNumber - b.queueNumber)
    .slice(0, limit);

  async function advance(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const target = nextStatus(order.status);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: target } : o)));
    const result = await advanceOrderStatus(id, target);
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
    }
  }

  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground">No active orders right now — kitchen&apos;s clear.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {active.map((order) => {
        const TypeIcon = TYPE_ICON[order.orderType];
        return (
          <Card key={order.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
                  #{order.queueNumber}
                </span>
                <OrderStatusBadge status={order.status} />
              </div>

              <div>
                <p className="text-sm font-semibold">{order.customerName}</p>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <TypeIcon className="h-3 w-3" />
                  {order.orderType === "table" ? `Table ${order.tableNumber}` : order.orderType === "delivery" ? order.address : "Pickup"}
                </p>
              </div>

              <ul className="flex-1 space-y-1 text-xs text-muted-foreground">
                {order.items.map((i, idx) => (
                  <li key={idx}>
                    {i.quantity}x {i.title}
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-bold">{formatMoney(order.total, order.currency)}</span>
                {order.status !== "out_for_delivery" || order.orderType !== "delivery" ? (
                  <Button size="sm" variant="outline" onClick={() => advance(order.id)} className="gap-1">
                    Advance <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{order.driver?.name}</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
