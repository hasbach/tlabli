"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow } from "@/lib/supabase/mappers";
import type { Restaurant } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export type RestaurantSettingsPatch = Partial<
  Pick<Restaurant, "name" | "whatsappNumber" | "tagline" | "address" | "currency" | "lbpExchangeRate" | "showBothCurrencies">
>;

export async function updateRestaurantSettings(
  restaurantId: string,
  patch: RestaurantSettingsPatch
): Promise<ActionResult<Restaurant>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.whatsappNumber !== undefined) update.whatsapp_number = patch.whatsappNumber;
  if (patch.tagline !== undefined) update.tagline = patch.tagline;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.lbpExchangeRate !== undefined) update.lbp_exchange_rate = patch.lbpExchangeRate;
  if (patch.showBothCurrencies !== undefined) update.show_both_currencies = patch.showBothCurrencies;

  const { data, error } = await supabase.from("restaurants").update(update).eq("id", restaurantId).select().single();

  if (error || !data) return { error: error?.message ?? "Failed to save settings" };
  revalidatePath("/dashboard/settings");
  return { data: mapRestaurantRow(data) };
}
