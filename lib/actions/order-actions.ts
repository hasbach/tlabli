"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import type { Order, OrderStatus, OrderLineItem, Currency } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export async function advanceOrderStatus(orderId: string, nextStatus: OrderStatus): Promise<ActionResult<Order>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", orderId)
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to update order" };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { data: mapOrderRow(data) };
}

export interface CreateOrderInput {
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  orderType: "delivery" | "pickup" | "table";
  tableNumber?: string;
  address?: string;
  items: OrderLineItem[];
  total: number;
  currency: Currency;
  promoCode?: string;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<ActionResult<{ id: string; queueNumber: number }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_restaurant_id: input.restaurantId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_order_type: input.orderType,
    p_table_number: input.tableNumber ?? null,
    p_address: input.address ?? null,
    p_items: input.items,
    p_total: input.total,
    p_currency: input.currency,
    p_promo_code: input.promoCode ?? null,
  });

  if (error || !data) return { error: error?.message ?? "Failed to place order" };
  const row = data as unknown as { id: string; queue_number: number };
  return { data: { id: row.id, queueNumber: row.queue_number } };
}
