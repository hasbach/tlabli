"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuItemRow, mapMenuCategoryRow, mapItemAddonRow } from "@/lib/supabase/mappers";
import type { MenuItem, MenuCategory, ItemAddon } from "@/lib/types";

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
  Pick<
    MenuItem,
    | "title"
    | "description"
    | "price"
    | "isAvailable"
    | "availableFrom"
    | "availableUntil"
    | "categoryId"
    | "imageUrl"
    | "titleAr"
    | "descriptionAr"
    | "titleFr"
    | "descriptionFr"
  >
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
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl;
  if (patch.titleAr !== undefined) update.title_ar = patch.titleAr || null;
  if (patch.descriptionAr !== undefined) update.description_ar = patch.descriptionAr || null;
  if (patch.titleFr !== undefined) update.title_fr = patch.titleFr || null;
  if (patch.descriptionFr !== undefined) update.description_fr = patch.descriptionFr || null;

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

export interface NewMenuCategoryInput {
  restaurantId: string;
  name: string;
  nameAr?: string;
  nameFr?: string;
}

export async function createMenuCategory(input: NewMenuCategoryInput): Promise<ActionResult<MenuCategory>> {
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("menu_categories")
    .select("sort_order")
    .eq("restaurant_id", input.restaurantId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = existing && existing.length > 0 ? (existing[0].sort_order as number) + 1 : 1;

  const { data, error } = await supabase
    .from("menu_categories")
    .insert({
      restaurant_id: input.restaurantId,
      name: input.name,
      sort_order: nextSortOrder,
      name_ar: input.nameAr || null,
      name_fr: input.nameFr || null,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to create category" };
  revalidatePath("/dashboard/menu");
  return { data: mapMenuCategoryRow(data) };
}

export interface NewItemAddonInput {
  itemId: string;
  name: string;
  extraPrice: number;
  nameAr?: string;
  nameFr?: string;
}

export async function createItemAddon(input: NewItemAddonInput): Promise<ActionResult<ItemAddon>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("item_addons")
    .insert({
      item_id: input.itemId,
      name: input.name,
      extra_price: input.extraPrice,
      name_ar: input.nameAr || null,
      name_fr: input.nameFr || null,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to add add-on" };
  revalidatePath("/dashboard/menu");
  return { data: mapItemAddonRow(data) };
}

export async function deleteItemAddon(id: string): Promise<ActionResult<true>> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("item_addons").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/menu");
  return { data: true };
}
