"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Printer, Store, Truck, Utensils, X } from "lucide-react";
import type { Driver, Order } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { OrderStatusBadge, nextStatus } from "./order-status-badge";
import { advanceOrderStatus } from "@/lib/actions/order-actions";
import { assignOrderDriver } from "@/lib/actions/driver-actions";
import { supabase } from "@/lib/supabase/client";
import { PrintTicket } from "./print-ticket";
import type { PrintJob, PrintRole } from "./print-ticket";

const TYPE_ICON = { delivery: MapPin, pickup: Store, table: Utensils };

export function OrderQueueBoard({
  initialOrders,
  restaurantId,
  restaurantName,
  posPrinterEnabled,
  kitchenPrinterEnabled,
  barPrinterEnabled,
  receiptWidthMm,
  drivers,
  limit,
}: {
  initialOrders: Order[];
  restaurantId: string;
  restaurantName: string;
  posPrinterEnabled: boolean;
  kitchenPrinterEnabled: boolean;
  barPrinterEnabled: boolean;
  receiptWidthMm: number;
  drivers: Driver[];
  limit?: number;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  // The realtime handler is registered once per restaurant; read drivers
  // through a ref so it always resolves driver_id against the latest list.
  const driversRef = useRef(drivers);
  driversRef.current = drivers;

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
              driverId: (row.driver_id as string) ?? undefined,
              driver: driversRef.current.find((d) => d.id === row.driver_id),
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
    if (order.orderType === "delivery" && order.status === "out_for_delivery") {
      if (!window.confirm(`Mark order #${order.queueNumber} as delivered?`)) return;
    }
    setBoardError(null);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: target } : o)));
    const result = await advanceOrderStatus(id, target, order.status);
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
      setBoardError(result.error);
    }
  }

  async function cancel(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    setBoardError(null);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
    const result = await advanceOrderStatus(id, "cancelled", order.status);
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
      setBoardError(result.error);
    }
  }

  async function assignDriver(order: Order, driverId: string | null) {
    if ((order.driverId ?? null) === driverId) return;
    if (order.status === "out_for_delivery" && order.driverId) {
      const current = order.driver?.name ?? "The current driver";
      if (!window.confirm(`${current} already picked this order up. Reassign anyway?`)) return;
    }
    const driver = drivers.find((d) => d.id === driverId);
    setBoardError(null);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, driverId: driverId ?? undefined, driver } : o)));
    const result = await assignOrderDriver(order.id, driverId);
    if ("error" in result) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, driverId: order.driverId, driver: order.driver } : o)));
      setBoardError(result.error);
    }
  }

  const clearPrintJob = useCallback(() => setPrintJob(null), []);

  function print(order: Order, role: PrintRole) {
    setPrintJob({ order, role, restaurantName, receiptWidthMm });
  }

  const printRoles: { role: PrintRole; label: string; enabled: boolean }[] = [
    { role: "pos", label: "POS", enabled: posPrinterEnabled },
    { role: "kitchen", label: "Kitchen", enabled: kitchenPrinterEnabled },
    { role: "bar", label: "Bar", enabled: barPrinterEnabled },
  ];

  return (
    <>
      {boardError && <p className="mb-3 text-sm text-destructive">{boardError}</p>}
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active orders right now — kitchen&apos;s clear.</p>
      ) : (
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

                  {order.orderType === "delivery" && (
                    <div className="flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {drivers.length === 0 ? (
                        <Link href="/dashboard/settings#drivers" className="text-xs text-primary underline">
                          Add a driver
                        </Link>
                      ) : (
                        <select
                          aria-label={`Driver for order #${order.queueNumber}`}
                          value={order.driverId ?? ""}
                          onChange={(e) => assignDriver(order, e.target.value || null)}
                          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {!order.driverId && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          No driver
                        </span>
                      )}
                    </div>
                  )}

                  <ul className="flex-1 space-y-1 text-xs text-muted-foreground">
                    {order.items.map((i, idx) => (
                      <li key={idx}>
                        {i.quantity}x {i.title}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-1.5">
                    {printRoles
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <Button
                          key={p.role}
                          size="sm"
                          variant="outline"
                          onClick={() => print(order, p.role)}
                          className="gap-1 text-xs"
                        >
                          <Printer className="h-3 w-3" /> {p.label}
                        </Button>
                      ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-sm font-bold">{formatMoney(order.total, order.currency)}</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancel(order.id)}
                        className="gap-1 text-muted-foreground hover:text-destructive"
                        aria-label="Cancel order"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => advance(order.id)} className="gap-1">
                        {order.status === "out_for_delivery" && order.orderType === "delivery" ? "Delivered" : "Advance"}{" "}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <PrintTicket job={printJob} onDone={clearPrintJob} />
    </>
  );
}
