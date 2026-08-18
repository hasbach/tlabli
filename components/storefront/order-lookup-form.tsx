"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Order } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/currency";
import { lookupOrdersByPhone } from "@/lib/actions/order-lookup-actions";

export function OrderLookupForm({
  restaurantId,
  restaurantSlug,
  restaurantName,
}: {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
}) {
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setError(null);
    setLoading(true);
    const result = await lookupOrdersByPhone(restaurantId, phone);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      setResults(null);
      return;
    }
    setResults(result.data);
  }

  return (
    <>
      <Card className="p-5">
        <h1 className="text-lg font-bold">Track your order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the phone number you ordered with at {restaurantName} to find your recent orders.
        </p>
        <div className="mt-4">
          <Label htmlFor="lookup-phone">Phone number</Label>
          <Input
            id="lookup-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="03 123 456"
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>
        <Button className="mt-4 w-full gap-1.5" onClick={search} disabled={!phone.trim() || loading}>
          <Search className="h-4 w-4" /> {loading ? "Searching…" : "Find my orders"}
        </Button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      {results && (
        <div className="mt-5 space-y-3">
          {results.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No recent orders found for that number.</p>
          ) : (
            results.map((order) => (
              <Link key={order.id} href={`/order/${order.id}`}>
                <Card className="flex items-center justify-between p-4 transition hover:border-primary">
                  <div>
                    <p className="text-sm font-semibold">Order #{order.queueNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.items.map((i) => `${i.quantity}x ${i.title}`).join(", ")}
                    </p>
                  </div>
                  <span className="text-sm font-bold">{formatMoney(order.total, order.currency)}</span>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link href={`/${restaurantSlug}`} className="underline">
          Back to menu
        </Link>
      </p>
    </>
  );
}
