"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { MenuSection } from "@/lib/menu";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleProvider";
import { localizedCategoryName } from "@/lib/i18n/localized-menu-content";
import { resolveBrandColors, brandColorsToCssVars } from "@/lib/branding";
import { CartProvider } from "@/components/storefront/cart-provider";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartTrigger } from "@/components/storefront/cart-trigger";
import { LanguageSwitcher } from "@/components/storefront/language-switcher";
import { OpenBadge } from "@/components/storefront/open-badge";
import { FineDiningItemRow } from "./fine-dining-item-row";

function FineDiningBody({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  const { t, locale } = useLocale();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-y-2 px-6 py-5">
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

      <section
        className="relative px-6 pb-10 text-center"
        style={
          restaurant.headerImageUrl
            ? { backgroundImage: `url(${restaurant.headerImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {restaurant.headerImageUrl && <div className="absolute inset-0 bg-black/50" />}
        <div className={`relative mx-auto max-w-xl ${restaurant.headerImageUrl ? "py-8" : ""}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${restaurant.headerImageUrl ? "text-white/90" : "text-secondary"}`}>
            Est. in Beirut
          </p>
          <h1 className={`mt-3 font-display text-5xl tracking-wide ${restaurant.headerImageUrl ? "text-white" : ""}`}>
            {restaurant.name}
          </h1>
          <div className={`mx-auto mt-4 h-px w-16 ${restaurant.headerImageUrl ? "bg-white/70" : "bg-secondary"}`} />
          <p className={`mx-auto mt-4 max-w-xs text-sm ${restaurant.headerImageUrl ? "text-white/90" : "text-muted-foreground"}`}>
            {restaurant.tagline}
          </p>
          <div className="mt-4 flex justify-center">
            <OpenBadge hours={restaurant.hours} openLabel={t("openNow")} closedLabel={t("closedNow")} />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-xl px-6 pb-20">
        {sections.map((s, idx) => (
          <section key={s.category.id} className={idx > 0 ? "mt-10" : ""}>
            <h2 className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
              {localizedCategoryName(s.category, locale)}
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

export function FineDiningTemplate({
  restaurant,
  sections,
  whatsappCloudApiAvailable,
}: {
  restaurant: Restaurant;
  sections: MenuSection[];
  whatsappCloudApiAvailable: boolean;
}) {
  const brandColors = resolveBrandColors(restaurant);
  return (
    <div className="theme-fine-dining" style={brandColors ? brandColorsToCssVars(brandColors) : undefined}>
      <LocaleProvider availableLocales={restaurant.languages} defaultLocale={restaurant.languages[0]}>
        <CartProvider currency={restaurant.currency}>
          <FineDiningBody restaurant={restaurant} sections={sections} whatsappCloudApiAvailable={whatsappCloudApiAvailable} />
        </CartProvider>
      </LocaleProvider>
    </div>
  );
}
