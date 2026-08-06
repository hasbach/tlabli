"use client";

import { ShoppingCart } from "lucide-react";
import { useCart } from "./cart-provider";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function CartTrigger({ className }: { className?: string }) {
  const { itemCount, setIsOpen } = useCart();
  const { t } = useLocale();

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className={`relative flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold shadow-soft transition-transform hover:scale-[1.03] cursor-pointer ${className ?? ""}`}
      aria-label={t("cart")}
    >
      <ShoppingCart className="h-4 w-4" />
      <span className="hidden sm:inline">{t("cart")}</span>
      {itemCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
          {itemCount}
        </span>
      )}
    </button>
  );
}
