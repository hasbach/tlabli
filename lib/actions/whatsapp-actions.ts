"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import type { WhatsAppSettings } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export type WhatsAppSettingsPatch = Partial<Pick<WhatsAppSettings, "mode" | "ownAccessToken" | "ownPhoneNumberId">>;

export async function updateWhatsAppSettings(
  restaurantId: string,
  patch: WhatsAppSettingsPatch
): Promise<ActionResult<WhatsAppSettings>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = { restaurant_id: restaurantId };
  if (patch.mode !== undefined) update.mode = patch.mode;
  if (patch.ownAccessToken !== undefined) update.own_access_token = patch.ownAccessToken || null;
  if (patch.ownPhoneNumberId !== undefined) update.own_phone_number_id = patch.ownPhoneNumberId || null;

  const { data, error } = await supabase
    .from("whatsapp_settings")
    .upsert(update, { onConflict: "restaurant_id" })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to save WhatsApp settings" };
  revalidatePath("/dashboard/settings");
  return { data: mapWhatsAppSettingsRow(data) };
}
