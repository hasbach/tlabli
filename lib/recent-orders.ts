// Orders placed from this phone, remembered in localStorage so a customer who
// closed the tracking page can get back to it from the restaurant's menu —
// no account needed. Per-device convenience only: it can be empty (private
// mode, cleared storage), so every read/write is wrapped and failure just
// means "nothing remembered".

const STORAGE_KEY = "tlabli-recent-orders";
const MAX_ORDERS = 10;
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
export const RECENT_ORDERS_EVENT = "tlabli:recent-orders";

export interface RecentOrderRef {
  id: string;
  restaurantId: string;
  queueNumber: number;
  placedAt: string;
}

function readAll(): RecentOrderRef[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter(
      (o): o is RecentOrderRef =>
        typeof o?.id === "string" && typeof o?.restaurantId === "string" && Date.parse(o.placedAt) > cutoff
    );
  } catch {
    return [];
  }
}

function writeAll(orders: RecentOrderRef[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.slice(0, MAX_ORDERS)));
  } catch {
    // Storage blocked or full — remembering is best-effort.
  }
}

export function rememberOrder(order: Omit<RecentOrderRef, "placedAt">) {
  writeAll([{ ...order, placedAt: new Date().toISOString() }, ...readAll().filter((o) => o.id !== order.id)]);
  window.dispatchEvent(new Event(RECENT_ORDERS_EVENT));
}

export function getRecentOrders(restaurantId: string): RecentOrderRef[] {
  return readAll().filter((o) => o.restaurantId === restaurantId);
}

export function forgetOrders(ids: string[]) {
  if (ids.length === 0) return;
  writeAll(readAll().filter((o) => !ids.includes(o.id)));
}
