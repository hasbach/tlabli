import { redirect } from "next/navigation";
import { MenuBuilder } from "@/components/dashboard/menu-builder";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuCategoryRow, mapItemAddonRow, mapMenuItemRow } from "@/lib/supabase/mappers";

export default async function MenuBuilderPage() {
  const current = await getCurrentRestaurant();
  if (!current) redirect("/login");
  const { restaurant } = current;

  const supabase = createServerSupabaseClient();
  const { data: categoryRows } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("sort_order", { ascending: true });

  const categories = (categoryRows ?? []).map(mapMenuCategoryRow);
  const categoryIds = categories.map((c) => c.id);

  const { data: itemRows } = categoryIds.length
    ? await supabase.from("menu_items").select("*").in("category_id", categoryIds)
    : { data: [] };

  const itemIds = (itemRows ?? []).map((r) => r.id as string);
  const { data: addonRows } = itemIds.length
    ? await supabase.from("item_addons").select("*").in("item_id", itemIds)
    : { data: [] };

  const items = (itemRows ?? []).map((row) => {
    const addons = (addonRows ?? []).filter((a) => a.item_id === row.id).map(mapItemAddonRow);
    return mapMenuItemRow(row, addons);
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Menu builder</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add categories and dishes, set prices, and mark items sold out or time-limited — changes here are what your
        customers see instantly on your live menu.
      </p>
      <MenuBuilder categories={categories} initialItems={items} />
    </div>
  );
}
