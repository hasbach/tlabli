import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/menu";
import { OrderLookupForm } from "@/components/storefront/order-lookup-form";

export default async function TrackOrderPage({ params }: { params: { restaurantSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.restaurantSlug);
  if (!restaurant) notFound();

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-md">
        <OrderLookupForm restaurantId={restaurant.id} restaurantSlug={restaurant.slug} restaurantName={restaurant.name} />
      </div>
    </div>
  );
}
