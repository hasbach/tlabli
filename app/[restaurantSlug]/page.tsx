import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRestaurantBySlug, restaurants } from "@/lib/mock-data";
import { getMenuSections } from "@/lib/menu";
import { TemplateRenderer } from "@/components/templates";

// TODO(supabase): replace the mock lookups above with a query against the
// `restaurants` / `menu_categories` / `menu_items` tables once connected.

export function generateStaticParams() {
  return restaurants.map((r) => ({ restaurantSlug: r.slug }));
}

export function generateMetadata({ params }: { params: { restaurantSlug: string } }): Metadata {
  const restaurant = getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) return {};
  return {
    title: `${restaurant.name} — Order online`,
    description: restaurant.tagline,
  };
}

export default function RestaurantStorefrontPage({ params }: { params: { restaurantSlug: string } }) {
  const restaurant = getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) notFound();

  const sections = getMenuSections(restaurant.id);

  return <TemplateRenderer restaurant={restaurant} sections={sections} />;
}
