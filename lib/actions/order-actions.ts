"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import { sendWhatsAppCloudApiNotification } from "@/lib/whatsapp-cloud-api";
import type { Order, OrderStatus, OrderLineItem, Currency } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export async function advanceOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  expectedStatus?: OrderStatus
): Promise<ActionResult<Order>> {
  const supabase = createServerSupabaseClient();
  let query = supabase.from("orders").update({ status: nextStatus }).eq("id", orderId);
  if (expectedStatus) query = query.eq("status", expectedStatus);
  const { data, error } = await query.select().maybeSingle();

  if (error) return { error: error.message };
  if (!data) {
    return { error: "This order was already updated — refresh to see its current status." };
  }
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
  /** Client-chosen order id, so the customer's WhatsApp message can link to /order/<id> (17_client_order_id.sql). */
  id?: string;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<ActionResult<{ id: string; queueNumber: number; whatsappNotified: boolean }>> {
  const supabase = createServerSupabaseClient();
  const args = {
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
  };
  let { data, error } = await supabase.rpc("create_order", input.id ? { ...args, p_id: input.id } : args);

  // PGRST202 = no create_order matching these arguments, i.e.
  // 17_client_order_id.sql hasn't been applied yet. Never fail checkout over
  // it: retry without p_id (the order gets a database-generated id, so only
  // its WhatsApp tracking link is affected).
  if (error?.code === "PGRST202" && input.id) {
    console.error("create_order has no p_id parameter yet — apply supabase/sql/17_client_order_id.sql");
    ({ data, error } = await supabase.rpc("create_order", args));
  }

  if (error || !data) {
    console.error(
      `createOrder failed for restaurant ${input.restaurantId}:`,
      error?.message ?? "no data returned from create_order RPC"
    );
    return { error: error?.message ?? "Failed to place order" };
  }
  const row = data as unknown as { id: string; queue_number: number };

  // Never let a WhatsApp problem affect order creation, which has already
  // succeeded by this point — sendWhatsAppCloudApiNotification is designed
  // to never throw, but this repo's rule is "never trust a call site not to
  // reject," so it's wrapped anyway.
  let whatsappNotified = false;
  try {
    const result = await sendWhatsAppCloudApiNotification(input.restaurantId, row.id, input);
    whatsappNotified = result.sent;
  } catch (err) {
    console.error(`sendWhatsAppCloudApiNotification threw unexpectedly for order ${row.id}:`, err);
  }

  return { data: { id: row.id, queueNumber: row.queue_number, whatsappNotified } };
}
