import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuCategoryRow, mapItemAddonRow, mapMenuItemRow, mapRestaurantRow } from "@/lib/supabase/mappers";
import type { MenuCategory, MenuItem, Restaurant } from "./types";

export interface MenuSection {
  category: MenuCategory;
  items: MenuItem[];
}

/**
 * Builds the category -> items structure a template component renders, from
 * the live Supabase project (public-read RLS on menu_categories/menu_items/
 * item_addons — no session required, matches the storefront having no login).
 */
export async function getMenuSections(restaurantId: string): Promise<MenuSection[]> {
  const supabase = createServerSupabaseClient();
  const { data: categoryRows } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });

  const categories = (categoryRows ?? []).map(mapMenuCategoryRow);
  const categoryIds = categories.map((c) => c.id);
  if (categoryIds.length === 0) return [];

  const { data: itemRows } = await supabase.from("menu_items").select("*").in("category_id", categoryIds);
  const itemIds = (itemRows ?? []).map((r) => r.id as string);

  const { data: addonRows } = itemIds.length
    ? await supabase.from("item_addons").select("*").in("item_id", itemIds)
    : { data: [] };

  return categories.map((category) => ({
    category,
    items: (itemRows ?? [])
      .filter((row) => row.category_id === category.id)
      .map((row) => mapMenuItemRow(row, (addonRows ?? []).filter((a) => a.item_id === row.id).map(mapItemAddonRow))),
  }));
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("restaurants").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return mapRestaurantRow(data);
}
