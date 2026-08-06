import { getCategoriesForRestaurant, getItemsForCategory } from "./mock-data";
import type { MenuCategory, MenuItem } from "./types";

export interface MenuSection {
  category: MenuCategory;
  items: MenuItem[];
}

/**
 * Builds the category -> items structure a template component renders.
 * Isolated here so template components never import lib/mock-data directly —
 * swap this one function for a Supabase query later and every template,
 * page, and preview keeps working unchanged.
 */
export function getMenuSections(restaurantId: string): MenuSection[] {
  return getCategoriesForRestaurant(restaurantId).map((category) => ({
    category,
    items: getItemsForCategory(category.id),
  }));
}
