"use client";

import { Flame, MapPin, Phone } from "lucide-react";
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

function FastFoodBody({
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
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">
              {restaurant.logoInitial}
            </div>
            <div>
              <p className="text-lg font-extrabold leading-tight tracking-tight">{restaurant.name}</p>
              <OpenBadge hours={restaurant.hours} openLabel={t("openNow")} closedLabel={t("closedNow")} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <CartTrigger />
          </div>
        </div>
      </header>

      <section
        className="relative overflow-hidden px-4 py-10 text-center"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--secondary))" }}
      >
        <Flame className="mx-auto mb-3 h-9 w-9 text-white/90" strokeWidth={1.5} />
        <h1 className="mx-auto max-w-md text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
          {restaurant.tagline}
        </h1>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm font-medium text-white/90">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" /> {restaurant.address}
          </span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-4 w-4" /> {restaurant.phone}
          </span>
        </div>
      </section>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <Tabs defaultValue={sections[0]?.category.id}>
          <TabsList className="w-full justify-start">
            {sections.map((s) => (
              <TabsTrigger key={s.category.id} value={s.category.id}>
                {s.category.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((s) => (
            <TabsContent key={s.category.id} value={s.category.id}>
              <div className="grid gap-3 sm:grid-cols-2">
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

export function FastFoodTemplate({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  return (
    <div className="theme-fast-food">
      <LocaleProvider availableLocales={restaurant.languages} defaultLocale={restaurant.languages[0]}>
        <CartProvider currency={restaurant.currency}>
          <FastFoodBody restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />
        </CartProvider>
      </LocaleProvider>
    </div>
  );
}
