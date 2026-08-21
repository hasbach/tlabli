// -----------------------------------------------------------------------------
// Owner-entered menu content (category names, item titles/descriptions,
// add-on names) is free text the restaurant typed in one language — it is
// NOT covered by dictionaries.ts, which only translates this app's own UI
// strings. These helpers resolve the storefront's current locale against
// the optional per-locale fields owners can fill in, falling back to the
// base (default-language) text whenever a translation was left blank.
//
// Order records always carry the base text (see cart-provider.tsx/
// cart-drawer.tsx), never the localized display string — translation is a
// storefront-browsing concern only, not part of the order data model.
// -----------------------------------------------------------------------------

import type { Locale, MenuCategory, MenuItem, ItemAddon } from "@/lib/types";

export function localizedCategoryName(category: MenuCategory, locale: Locale): string {
  if (locale === "ar" && category.nameAr) return category.nameAr;
  if (locale === "fr" && category.nameFr) return category.nameFr;
  return category.name;
}

export function localizedItemTitle(item: MenuItem, locale: Locale): string {
  if (locale === "ar" && item.titleAr) return item.titleAr;
  if (locale === "fr" && item.titleFr) return item.titleFr;
  return item.title;
}

export function localizedItemDescription(item: MenuItem, locale: Locale): string {
  if (locale === "ar" && item.descriptionAr) return item.descriptionAr;
  if (locale === "fr" && item.descriptionFr) return item.descriptionFr;
  return item.description;
}

export function localizedAddonName(addon: ItemAddon, locale: Locale): string {
  if (locale === "ar" && addon.nameAr) return addon.nameAr;
  if (locale === "fr" && addon.nameFr) return addon.nameFr;
  return addon.name;
}
