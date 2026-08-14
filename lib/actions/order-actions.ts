"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import type { Order, OrderStatus } from "@/lib/types";

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
