"use client";

import Link from "next/link";
import { Coffee, MapPin, Phone, Search } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { MenuSection } from "@/lib/menu";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleProvider";
import { CartProvider } from "@/components/storefront/cart-provider";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartTrigger } from "@/components/storefront/cart-trigger";
import { LanguageSwitcher } from "@/components/storefront/language-switcher";
import { OpenBadge } from "@/components/storefront/open-badge";
import { MenuItemCard } from "@/components/storefront/menu-item-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function CafeBody({
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
      <section className="relative px-4 pb-8 pt-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
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
        </div>

        <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white shadow-soft"
            style={{ background: "var(--primary)" }}
          >
            <Coffee className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{restaurant.name}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{restaurant.tagline}</p>
          <OpenBadge hours={restaurant.hours} openLabel={t("openNow")} closedLabel={t("closedNow")} />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {restaurant.address}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" /> {restaurant.phone}
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-2xl px-4 pb-16">
        <Tabs defaultValue={sections[0]?.category.id}>
          <TabsList className="mx-auto w-full max-w-md justify-center">
            {sections.map((s) => (
              <TabsTrigger key={s.category.id} value={s.category.id}>
                {s.category.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((s) => (
            <TabsContent key={s.category.id} value={s.category.id}>
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
            </TabsContent>
          ))}
        </Tabs>
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

export function CafeTemplate({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  return (
    <div className="theme-cafe">
      <LocaleProvider availableLocales={restaurant.languages} defaultLocale={restaurant.languages[0]}>
        <CartProvider currency={restaurant.currency}>
          <CafeBody restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />
        </CartProvider>
      </LocaleProvider>
    </div>
  );
}
