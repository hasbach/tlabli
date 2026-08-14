"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuItemRow } from "@/lib/supabase/mappers";
import type { MenuItem } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export interface NewMenuItemInput {
  categoryId: string;
  title: string;
  description: string;
  price: number;
  isAvailable: boolean;
  availableFrom?: string;
  availableUntil?: string;
}

export type MenuItemPatch = Partial<
  Pick<MenuItem, "title" | "description" | "price" | "isAvailable" | "availableFrom" | "availableUntil">
>;

export async function createMenuItem(input: NewMenuItemInput): Promise<ActionResult<MenuItem>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      category_id: input.categoryId,
      title: input.title,
      description: input.description,
      price: input.price,
      is_available: input.isAvailable,
      available_from: input.availableFrom ?? null,
      available_until: input.availableUntil ?? null,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to create item" };
  revalidatePath("/dashboard/menu");
  return { data: mapMenuItemRow(data, []) };
}

export async function updateMenuItem(id: string, patch: MenuItemPatch): Promise<ActionResult<MenuItem>> {
  const supabase = createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.isAvailable !== undefined) update.is_available = patch.isAvailable;
  if (patch.availableFrom !== undefined) update.available_from = patch.availableFrom || null;
  if (patch.availableUntil !== undefined) update.available_until = patch.availableUntil || null;

  const { data, error } = await supabase.from("menu_items").update(update).eq("id", id).select().single();

  if (error || !data) return { error: error?.message ?? "Failed to update item" };
  revalidatePath("/dashboard/menu");
  return { data: mapMenuItemRow(data, []) };
}

export async function deleteMenuItem(id: string): Promise<ActionResult<true>> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/menu");
  return { data: true };
}
