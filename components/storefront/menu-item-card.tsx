"use client";

import { useMemo, useState } from "react";
import { Plus, Minus, ShoppingCart, Clock } from "lucide-react";
import type { MenuItem, Currency } from "@/lib/types";
import { formatMoney, formatDualCurrency } from "@/lib/currency";
import { FoodImagePlaceholder } from "./food-image-placeholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "./cart-provider";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function MenuItemCard({
  item,
  currency,
  showBothCurrencies,
  lbpExchangeRate,
}: {
  item: MenuItem;
  currency: Currency;
  showBothCurrencies: boolean;
  lbpExchangeRate: number;
}) {
  const { addLine } = useCart();
  const { t } = useLocale();
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [variant, setVariant] = useState<string | undefined>(item.variants?.[0]);
  const [qty, setQty] = useState(1);

  const chosenAddons = useMemo(
    () => item.addons.filter((a) => selectedAddons.includes(a.id)),
    [item.addons, selectedAddons]
  );

  const unitTotal = item.price + chosenAddons.reduce((s, a) => s + a.extraPrice, 0);
  const priceLabel = showBothCurrencies
    ? formatDualCurrency(unitTotal, lbpExchangeRate)
    : formatMoney(unitTotal, currency);

  const isTimeWindowed = Boolean(item.availableFrom && item.availableUntil);
  const soldOut = !item.isAvailable;

  function toggleAddon(id: string) {
    setSelectedAddons((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function handleAdd() {
    if (soldOut) return;
    const key = [item.id, variant, ...selectedAddons.slice().sort()].filter(Boolean).join("|");
    addLine(
      {
        key,
        itemId: item.id,
        title: variant ? `${item.title} (${variant})` : item.title,
        unitPrice: item.price,
        addons: chosenAddons,
      },
      qty
    );
    setQty(1);
    setSelectedAddons([]);
  }

  return (
    <div
      className="group flex min-w-0 gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-card"
      style={{ opacity: soldOut ? 0.6 : 1 }}
    >
      <FoodImagePlaceholder
        label={item.title}
        imageUrl={item.imageUrl}
        className="h-24 w-24 shrink-0 rounded-xl"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 font-semibold leading-snug">{item.title}</h3>
          <span className="whitespace-nowrap font-semibold text-primary">{priceLabel}</span>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {item.isPopular && !soldOut && <Badge variant="default">{t("popular")}</Badge>}
          {soldOut && <Badge variant="destructive">{t("soldOut")}</Badge>}
          {isTimeWindowed && !soldOut && (
            <Badge variant="muted" className="gap-1">
              <Clock className="h-3 w-3" /> {item.availableFrom}–{item.availableUntil}
            </Badge>
          )}
        </div>

        {!soldOut && item.variants && item.variants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {item.variants.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  variant === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {!soldOut && item.addons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {item.addons.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAddon(a.id)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedAddons.includes(a.id)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                + {a.name} (${a.extraPrice.toFixed(2)})
              </button>
            ))}
          </div>
        )}

        {!soldOut && (
          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-lg border border-border">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center text-sm font-medium">{qty}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQty((q) => q + 1)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button size="sm" onClick={handleAdd} className="gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              {t("addToCart")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
