import { MenuBuilder } from "@/components/dashboard/menu-builder";
import { getCategoriesForRestaurant, menuItems, restaurants } from "@/lib/mock-data";

export default function MenuBuilderPage() {
  const restaurant = restaurants[0];
  const categories = getCategoriesForRestaurant(restaurant.id);
  const items = menuItems.filter((i) => categories.some((c) => c.id === i.categoryId));

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
