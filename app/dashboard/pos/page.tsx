import { redirect } from "next/navigation";
import { PosOrderBuilder } from "@/components/dashboard/pos-order-builder";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapMenuCategoryRow, mapItemAddonRow, mapMenuItemRow } from "@/lib/supabase/mappers";

export default async function PosPage() {
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
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Point of sale</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Tap dishes to build an order for a walk-in, phone, or table customer, then place it — it joins the same
        queue as orders placed on your live menu.
      </p>
      <PosOrderBuilder
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        currency={restaurant.currency}
        categories={categories}
        items={items}
        posPrinterEnabled={restaurant.posPrinterEnabled}
        kitchenPrinterEnabled={restaurant.kitchenPrinterEnabled}
        barPrinterEnabled={restaurant.barPrinterEnabled}
        receiptWidthMm={restaurant.receiptWidthMm}
      />
    </div>
  );
}
