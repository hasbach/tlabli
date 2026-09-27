// Server-only: loads what a driver's magic link is allowed to see, via the
// driver_get_orders SECURITY DEFINER RPC (supabase/sql/15_drivers.sql). The
// token is the only credential — no session is involved.

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Currency, OrderLineItem, OrderStatus } from "@/lib/types";

export interface DriverViewOrder {
  id: string;
  queueNumber: number;
  customerName: string;
  customerPhone: string;
  address?: string;
  items: OrderLineItem[];
  total: number;
  currency: Currency;
  status: OrderStatus;
  createdAt: string;
}

export interface DriverView {
  driverName: string;
  restaurantName: string;
  restaurantPhone: string;
  showBothCurrencies: boolean;
  lbpExchangeRate: number;
  orders: DriverViewOrder[];
}

export type DriverViewResult = { kind: "ok"; view: DriverView } | { kind: "invalid" } | { kind: "error" };

export async function getDriverView(token: string): Promise<DriverViewResult> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("driver_get_orders", { p_token: token });
  if (error) return error.message === "invalid_link" ? { kind: "invalid" } : { kind: "error" };

  const json = data as {
    driver: { name: string };
    restaurant: { name: string; phone: string; show_both_currencies: boolean; lbp_exchange_rate: number };
    orders: Record<string, unknown>[];
  };

  return {
    kind: "ok",
    view: {
      driverName: json.driver.name,
      restaurantName: json.restaurant.name,
      restaurantPhone: json.restaurant.phone,
      showBothCurrencies: json.restaurant.show_both_currencies,
      lbpExchangeRate: Number(json.restaurant.lbp_exchange_rate),
      orders: json.orders.map((o) => ({
        id: o.id as string,
        queueNumber: o.queue_number as number,
        customerName: o.customer_name as string,
        customerPhone: o.customer_phone as string,
        address: (o.address as string) ?? undefined,
        items: o.items as OrderLineItem[],
        total: Number(o.total),
        currency: o.currency as Currency,
        status: o.status as OrderStatus,
        createdAt: o.created_at as string,
      })),
    },
  };
}
