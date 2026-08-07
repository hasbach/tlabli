// Core data model — mirrors PROJECT_INSTRUCTIONS.md section 7.
// Kept as plain TypeScript types so this compiles today against mock data
// and later against real Supabase rows without changing consuming components.

export type RestaurantType =
  | "fast-food"
  | "bakery"
  | "fine-dining"
  | "cafe";

export type Currency = "USD" | "LBP";

export type Locale = "en" | "ar" | "fr";

export interface BusinessHours {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  open: string; // "09:00"
  close: string; // "22:00"
  closed?: boolean;
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  type: RestaurantType;
  templateId: RestaurantType;
  tagline: string;
  logoInitial: string;
  currency: Currency;
  showBothCurrencies: boolean;
  lbpExchangeRate: number; // LBP per 1 USD, owner-editable
  languages: Locale[];
  hours: BusinessHours[];
  planId: "free" | "basic" | "pro" | "custom";
  status: "trial" | "active" | "past_due" | "inactive";
  whatsappNumber: string;
  phone: string;
  address: string;
}

export interface ItemAddon {
  id: string;
  name: string;
  extraPrice: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  /** Per-item scheduling, e.g. a lunch special only shown 12:00-15:00. Undefined = always available within isAvailable. */
  availableFrom?: string;
  availableUntil?: string;
  addons: ItemAddon[];
  variants?: string[];
  isPopular?: boolean;
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
}

export type OrderStatus =
  | "received"
  | "preparing"
  | "out_for_delivery"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

export interface OrderLineItem {
  itemId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  addons: string[];
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
}

export interface Order {
  id: string;
  queueNumber: number;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  orderType: "delivery" | "pickup" | "table";
  tableNumber?: string;
  address?: string;
  items: OrderLineItem[];
  total: number;
  currency: Currency;
  status: OrderStatus;
  driver?: Driver;
  promoCode?: string;
  createdAt: string;
}

export interface PromoCode {
  id: string;
  restaurantId: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  active: boolean;
}

export interface Subscription {
  id: string;
  restaurantId: string;
  periodStart: string; // ISO date, e.g. "2026-07-01"
  periodEnd: string; // ISO date
  paymentProofRef?: string; // OMT/Whish reference note, set by admin
}

export type StaffRole = "owner" | "staff";

export interface StaffUser {
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  role: StaffRole;
}

export interface AnalyticsSnapshot {
  ordersToday: number;
  ordersThisWeek: number;
  totalSalesToday: number;
  totalSalesThisWeek: number;
  currency: Currency;
  topItems: { title: string; count: number }[];
  salesTrend: { date: string; sales: number }[];
  peakHours: { hour: string; orders: number }[];
}
