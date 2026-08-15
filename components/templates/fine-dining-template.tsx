"use client";

import type { Restaurant } from "@/lib/types";
import type { MenuSection } from "@/lib/menu";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleProvider";
import { CartProvider } from "@/components/storefront/cart-provider";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartTrigger } from "@/components/storefront/cart-trigger";
import { LanguageSwitcher } from "@/components/storefront/language-switcher";
import { OpenBadge } from "@/components/storefront/open-badge";
import { FineDiningItemRow } from "./fine-dining-item-row";

function FineDiningBody({ restaurant, sections }: { restaurant: Restaurant; sections: MenuSection[] }) {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-xl items-center justify-between px-6 py-5">
        <LanguageSwitcher />
        <CartTrigger />
      </header>

      <section className="mx-auto max-w-xl px-6 pb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">Est. in Beirut</p>
        <h1 className="mt-3 font-display text-5xl tracking-wide">{restaurant.name}</h1>
        <div className="mx-auto mt-4 h-px w-16 bg-secondary" />
        <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">{restaurant.tagline}</p>
        <div className="mt-4 flex justify-center">
          <OpenBadge hours={restaurant.hours} openLabel={t("openNow")} closedLabel={t("closedNow")} />
        </div>
      </section>

      <main className="mx-auto max-w-xl px-6 pb-20">
        {sections.map((s, idx) => (
          <section key={s.category.id} className={idx > 0 ? "mt-10" : ""}>
            <h2 className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
              {s.category.name}
            </h2>
            <div className="mt-2">
              {s.items.map((item) => (
                <FineDiningItemRow key={item.id} item={item} currency={restaurant.currency} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        {t("poweredBy")} <span className="font-semibold text-foreground">Tlabli</span>
      </footer>

      <CartDrawer restaurantId={restaurant.id} restaurantName={restaurant.name} whatsappNumber={restaurant.whatsappNumber} currency={restaurant.currency} />
    </div>
  );
}

export function FineDiningTemplate({ restaurant, sections }: { restaurant: Restaurant; sections: MenuSection[] }) {
  return (
    <div className="theme-fine-dining">
      <LocaleProvider availableLocales={restaurant.languages} defaultLocale={restaurant.languages[0]}>
        <CartProvider currency={restaurant.currency}>
          <FineDiningBody restaurant={restaurant} sections={sections} />
        </CartProvider>
      </LocaleProvider>
    </div>
  );
}
