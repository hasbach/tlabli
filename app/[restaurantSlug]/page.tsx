import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMenuSections, getRestaurantBySlug } from "@/lib/menu";
import { getWhatsAppCloudApiAvailability } from "@/lib/whatsapp-cloud-api";
import { TemplateRenderer } from "@/components/templates";

export async function generateMetadata({ params }: { params: { restaurantSlug: string } }): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) return {};
  return {
    title: `${restaurant.name} — Order online`,
    description: restaurant.tagline,
  };
}

export default async function RestaurantStorefrontPage({ params }: { params: { restaurantSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) notFound();

  const [sections, whatsappCloudApiAvailable] = await Promise.all([
    getMenuSections(restaurant.id),
    getWhatsAppCloudApiAvailability(restaurant.id, restaurant.planId),
  ]);

  return (
    <TemplateRenderer restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />
  );
}
