// -----------------------------------------------------------------------------
// Converts raw Supabase rows (snake_case columns, per supabase/sql/01_schema.sql)
// into this app's existing camelCase shapes (lib/types.ts) — every component
// that already renders Restaurant/MenuItem/Order/etc. from lib/mock-data.ts
// keeps working unchanged against these mapped objects.
// -----------------------------------------------------------------------------

import type { Restaurant, MenuCategory, MenuItem, ItemAddon, Order, OrderLineItem, StaffUser, Subscription, WhatsAppSettings } from "@/lib/types";

export function mapRestaurantRow(row: Record<string, unknown>): Restaurant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    type: row.type as Restaurant["type"],
    templateId: row.template_id as Restaurant["templateId"],
    tagline: row.tagline as string,
    logoInitial: row.logo_initial as string,
    currency: row.currency as Restaurant["currency"],
    showBothCurrencies: row.show_both_currencies as boolean,
    lbpExchangeRate: Number(row.lbp_exchange_rate),
    languages: row.languages as Restaurant["languages"],
    hours: row.hours as Restaurant["hours"],
    planId: row.plan_id as Restaurant["planId"],
    status: row.status as Restaurant["status"],
    whatsappNumber: row.whatsapp_number as string,
    phone: row.phone as string,
    address: row.address as string,
    // Falls back to the same defaults as the SQL columns themselves
    // (09_printer_settings.sql) so the print buttons still render sensibly
    // even before that migration is applied to the live database — only
    // saving a change through PrinterSettingsForm depends on it existing.
    posPrinterEnabled: (row.pos_printer_enabled as boolean | null | undefined) ?? true,
    kitchenPrinterEnabled: (row.kitchen_printer_enabled as boolean | null | undefined) ?? true,
    barPrinterEnabled: (row.bar_printer_enabled as boolean | null | undefined) ?? false,
  };
}

export function mapMenuCategoryRow(row: Record<string, unknown>): MenuCategory {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    nameAr: (row.name_ar as string) ?? undefined,
    nameFr: (row.name_fr as string) ?? undefined,
  };
}

export function mapItemAddonRow(row: Record<string, unknown>): ItemAddon {
  return {
    id: row.id as string,
    name: row.name as string,
    extraPrice: Number(row.extra_price),
    nameAr: (row.name_ar as string) ?? undefined,
    nameFr: (row.name_fr as string) ?? undefined,
  };
}

export function mapMenuItemRow(row: Record<string, unknown>, addons: ItemAddon[]): MenuItem {
  return {
    id: row.id as string,
    categoryId: row.category_id as string,
    title: row.title as string,
    description: row.description as string,
    price: Number(row.price),
    imageUrl: (row.image_url as string) ?? null,
    isAvailable: row.is_available as boolean,
    availableFrom: (row.available_from as string) ?? undefined,
    availableUntil: (row.available_until as string) ?? undefined,
    addons,
    variants: (row.variants as string[]) ?? undefined,
    isPopular: row.is_popular as boolean,
    titleAr: (row.title_ar as string) ?? undefined,
    descriptionAr: (row.description_ar as string) ?? undefined,
    titleFr: (row.title_fr as string) ?? undefined,
    descriptionFr: (row.description_fr as string) ?? undefined,
  };
}

export function mapOrderRow(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    queueNumber: row.queue_number as number,
    restaurantId: row.restaurant_id as string,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    orderType: row.order_type as Order["orderType"],
    tableNumber: (row.table_number as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    items: row.items as OrderLineItem[],
    total: Number(row.total),
    currency: row.currency as Order["currency"],
    status: row.status as Order["status"],
    driver: undefined,
    promoCode: (row.promo_code as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export function mapStaffUserRow(row: Record<string, unknown>): StaffUser {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    name: row.name as string,
    phone: row.phone as string,
    role: row.role as StaffUser["role"],
  };
}

export function mapSubscriptionRow(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    paymentProofRef: (row.payment_proof_ref as string) ?? undefined,
  };
}

export function mapWhatsAppSettingsRow(row: Record<string, unknown>): WhatsAppSettings {
  return {
    restaurantId: row.restaurant_id as string,
    mode: row.mode as WhatsAppSettings["mode"],
    ownAccessToken: (row.own_access_token as string) ?? undefined,
    ownPhoneNumberId: (row.own_phone_number_id as string) ?? undefined,
  };
}
