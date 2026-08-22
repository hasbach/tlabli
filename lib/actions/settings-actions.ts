"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow } from "@/lib/supabase/mappers";
import type { Restaurant } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export type RestaurantSettingsPatch = Partial<
  Pick<
    Restaurant,
    | "name"
    | "whatsappNumber"
    | "tagline"
    | "address"
    | "currency"
    | "lbpExchangeRate"
    | "showBothCurrencies"
    | "posPrinterEnabled"
    | "kitchenPrinterEnabled"
    | "barPrinterEnabled"
    | "brandPalette"
    | "brandPrimaryColor"
    | "brandSecondaryColor"
    | "headerImageUrl"
    | "languages"
    | "hours"
    | "temporarilyClosed"
  >
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
  if (patch.posPrinterEnabled !== undefined) update.pos_printer_enabled = patch.posPrinterEnabled;
  if (patch.kitchenPrinterEnabled !== undefined) update.kitchen_printer_enabled = patch.kitchenPrinterEnabled;
  if (patch.barPrinterEnabled !== undefined) update.bar_printer_enabled = patch.barPrinterEnabled;
  if (patch.brandPalette !== undefined) update.brand_palette = patch.brandPalette;
  if (patch.brandPrimaryColor !== undefined) update.brand_primary_color = patch.brandPrimaryColor || null;
  if (patch.brandSecondaryColor !== undefined) update.brand_secondary_color = patch.brandSecondaryColor || null;
  if (patch.headerImageUrl !== undefined) update.header_image_url = patch.headerImageUrl;
  if (patch.languages !== undefined) {
    if (patch.languages.length === 0) return { error: "At least one menu language is required." };
    update.languages = patch.languages;
  }
  if (patch.hours !== undefined) update.hours = patch.hours;
  if (patch.temporarilyClosed !== undefined) update.temporarily_closed = patch.temporarilyClosed;

  const { data, error } = await supabase.from("restaurants").update(update).eq("id", restaurantId).select().single();

  if (error || !data) return { error: error?.message ?? "Failed to save settings" };
  revalidatePath("/dashboard/settings");
  return { data: mapRestaurantRow(data) };
}
