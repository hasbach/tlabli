"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import type { DictionaryKey } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { supabase } from "@/lib/supabase/client";
import { RECENT_ORDERS_EVENT, forgetOrders, getRecentOrders } from "@/lib/recent-orders";

const REFRESH_MS = 60_000;

const STATUS_KEY: Partial<Record<OrderStatus, DictionaryKey>> = {
  received: "orderStatusReceived",
  preparing: "orderStatusPreparing",
  out_for_delivery: "orderStatusOnTheWay",
  ready_for_pickup: "orderStatusReady",
};

interface ActiveOrder {
  id: string;
  queueNumber: number;
  status: OrderStatus;
}

/** "Your order #24 · On the way · Track" for orders placed from this phone that are still in progress. */
export function RecentOrdersBanner({ restaurantId }: { restaurantId: string }) {
  const { t } = useLocale();
  const [orders, setOrders] = useState<ActiveOrder[]>([]);

  const load = useCallback(async () => {
    const remembered = getRecentOrders(restaurantId);
    if (remembered.length === 0) {
      setOrders([]);
      return;
    }
    const { data, error } = await supabase
      .from("orders")
      .select("id, queue_number, status")
      .in(
        "id",
        remembered.map((o) => o.id)
      );
    if (error || !data) return; // Offline or a blip — keep showing what we had.

    const active = data
      .filter((row) => row.status !== "completed" && row.status !== "cancelled")
      .map((row) => ({ id: row.id as string, queueNumber: row.queue_number as number, status: row.status as OrderStatus }))
      .sort((a, b) => b.queueNumber - a.queueNumber);
    // Finished or no-longer-existing orders don't need remembering.
    const activeIds = new Set(active.map((o) => o.id));
    forgetOrders(remembered.filter((o) => !activeIds.has(o.id)).map((o) => o.id));
    setOrders(active);
  }, [restaurantId]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    window.addEventListener(RECENT_ORDERS_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(RECENT_ORDERS_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  if (orders.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {orders.slice(0, 3).map((order) => {
        const statusKey = STATUS_KEY[order.status];
        return (
          <Link
            key={order.id}
            href={`/order/${order.id}`}
            className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm transition-colors hover:bg-primary/15"
          >
            <Receipt className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">
                {t("yourOrder")} #{order.queueNumber}
              </span>
              {statusKey && <span className="text-muted-foreground"> · {t(statusKey)}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1 font-semibold text-primary">
              {t("track")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
