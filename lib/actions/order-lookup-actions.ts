"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrderRow } from "@/lib/supabase/mappers";
import type { Order } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export async function lookupOrdersByPhone(restaurantId: string, phone: string): Promise<ActionResult<Order[]>> {
  const digitsOnly = phone.replace(/[^0-9]/g, "");
  if (digitsOnly.length < 6) return { error: "Enter a valid phone number." };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { error: error.message };

  const matches = (data ?? [])
    .filter((row) => {
      const rowDigits = (row.customer_phone as string).replace(/[^0-9]/g, "");
      return rowDigits.slice(-8) === digitsOnly.slice(-8);
    })
    .slice(0, 5)
    .map((row) => mapOrderRow(row));

  return { data: matches };
}
