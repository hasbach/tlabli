"use client";

import Link from "next/link";
import { Croissant, MapPin, Phone, Search } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { MenuSection } from "@/lib/menu";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleProvider";
import { CartProvider } from "@/components/storefront/cart-provider";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartTrigger } from "@/components/storefront/cart-trigger";
import { LanguageSwitcher } from "@/components/storefront/language-switcher";
import { OpenBadge } from "@/components/storefront/open-badge";
import { MenuItemCard } from "@/components/storefront/menu-item-card";

function BakeryBody({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/${restaurant.slug}/track`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            aria-label="Track order"
          >
            <Search className="h-4 w-4" />
          </Link>
          <LanguageSwitcher />
        </div>
        <CartTrigger />
      </header>

      <section className="mx-auto max-w-2xl px-4 pb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-primary text-2xl font-bold text-primary-foreground shadow-soft">
          {restaurant.logoInitial}
        </div>
        <h1 className="font-bakery text-4xl font-medium tracking-tight sm:text-5xl">{restaurant.name}</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{restaurant.tagline}</p>
        <div className="mt-4 flex items-center justify-center">
          <OpenBadge hours={restaurant.hours} openLabel={t("openNow")} closedLabel={t("closedNow")} />
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {restaurant.address}
          </span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" /> {restaurant.phone}
          </span>
        </div>
      </section>

      {/* anchor nav for quick jump between sections, in place of tabs */}
      <nav className="sticky top-0 z-30 mb-6 border-y border-border bg-background/95 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-4 overflow-x-auto px-4 scrollbar-thin">
          {sections.map((s) => (
            <a
              key={s.category.id}
              href={`#${s.category.id}`}
              className="whitespace-nowrap text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              {s.category.name}
            </a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 pb-16">
        {sections.map((s, idx) => (
          <section key={s.category.id} id={s.category.id} className={idx > 0 ? "mt-10" : ""}>
            <div className="mb-4 flex items-center gap-2">
              <Croissant className="h-5 w-5 text-primary" />
              <h2 className="font-bakery text-2xl font-medium">{s.category.name}</h2>
            </div>
            <div className="grid gap-3">
              {s.items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  currency={restaurant.currency}
                  showBothCurrencies={restaurant.showBothCurrencies}
                  lbpExchangeRate={restaurant.lbpExchangeRate}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        {t("poweredBy")} <span className="font-semibold text-foreground">Tlabli</span>
      </footer>

      <CartDrawer
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        whatsappNumber={restaurant.whatsappNumber}
        currency={restaurant.currency}
        whatsappCloudApiAvailable={whatsappCloudApiAvailable}
      />
    </div>
  );
}

export function BakeryTemplate({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  return (
    <div className="theme-bakery">
      <LocaleProvider availableLocales={restaurant.languages} defaultLocale={restaurant.languages[0]}>
        <CartProvider currency={restaurant.currency}>
          <BakeryBody restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />
        </CartProvider>
      </LocaleProvider>
    </div>
  );
}
