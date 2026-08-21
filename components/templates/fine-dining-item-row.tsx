"use client";

import { Plus } from "lucide-react";
import type { MenuItem, Currency } from "@/lib/types";
import { formatMoney } from "@/lib/currency";
import { useCart } from "@/components/storefront/cart-provider";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { localizedItemTitle, localizedItemDescription } from "@/lib/i18n/localized-menu-content";
import { Badge } from "@/components/ui/badge";

export function FineDiningItemRow({ item, currency }: { item: MenuItem; currency: Currency }) {
  const { addLine } = useCart();
  const { locale } = useLocale();
  const soldOut = !item.isAvailable;

  return (
    <div className="flex items-start gap-3 border-b border-border/70 py-5 last:border-0" style={{ opacity: soldOut ? 0.5 : 1 }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-lg tracking-wide">{localizedItemTitle(item, locale)}</h3>
          <span className="h-px flex-1 translate-y-[-3px] border-b border-dotted border-muted-foreground/40" />
          <span className="font-display text-lg text-secondary">{formatMoney(item.price, currency)}</span>
        </div>
        <p className="mt-1 text-sm italic text-muted-foreground">{localizedItemDescription(item, locale)}</p>
        {item.isPopular && !soldOut && (
          <Badge variant="secondary" className="mt-2">
            Chef&apos;s pick
          </Badge>
        )}
        {soldOut && (
          <Badge variant="destructive" className="mt-2">
            Sold out
          </Badge>
        )}
      </div>
      {!soldOut && (
        <button
          type="button"
          aria-label={`Add ${item.title} to order`}
          onClick={() => addLine({ key: item.id, itemId: item.id, title: item.title, unitPrice: item.price, addons: [] })}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-primary text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
