import Link from "next/link";
import { Phone, Truck } from "lucide-react";
import { orders, getRestaurantBySlug, restaurants } from "@/lib/mock-data";
import { OrderStatusTimeline } from "@/components/storefront/order-status-timeline";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";

// TODO(supabase): look up the real order by id once orders are written to
// the database on checkout, instead of this mock lookup.
export default function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const order = orders.find((o) => o.id === params.orderId) ?? orders[0];
  const restaurant = restaurants.find((r) => r.id === order.restaurantId);

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-md">
        {params.orderId !== order.id && (
          <p className="mb-4 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-center text-xs text-muted-foreground">
            Demo preview — showing a sample order since &quot;{params.orderId}&quot; wasn&apos;t found.
          </p>
        )}

        <Card className="mb-5 p-5 text-center">
          <p className="text-sm text-muted-foreground">Order #{order.queueNumber}</p>
          <h1 className="text-xl font-bold">{restaurant?.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{order.items.map((i) => `${i.quantity}x ${i.title}`).join(", ")}</p>
          <p className="mt-2 text-lg font-extrabold">{formatMoney(order.total, order.currency)}</p>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0">
            <OrderStatusTimeline status={order.status} />
          </CardContent>
        </Card>

        {order.driver && (
          <Card className="mt-5 flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{order.driver.name}</p>
                <p className="text-xs text-muted-foreground">Your driver</p>
              </div>
            </div>
            <Button size="sm" variant="outline" asChild>
              <a href={`tel:${order.driver.phone}`} className="gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            </Button>
          </Card>
        )}

        {restaurant && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link href={`/${restaurant.slug}`} className="underline">
              Back to menu
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
