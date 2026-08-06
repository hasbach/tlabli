import type { Order } from "./types";

/**
 * MVP order-notification path: a `wa.me` deep link pre-filled with the order
 * summary, opened right after checkout so the customer's own WhatsApp sends
 * the message to the restaurant. No Meta Business verification needed.
 *
 * Upgrade path (later, needs owner/admin action — see SETUP_TODO.md):
 * replace this with a server-side call to the WhatsApp Cloud API so the
 * notification fires automatically without the customer's phone in the loop.
 */
export function buildWhatsAppOrderMessage(
  order: Pick<Order, "items" | "total" | "currency" | "customerName" | "customerPhone" | "orderType" | "tableNumber" | "address">,
  restaurantName: string
): string {
  const lines = [
    `🔔 New order at ${restaurantName}`,
    "",
    ...order.items.map(
      (i) => `• ${i.quantity}x ${i.title}${i.addons.length ? ` (${i.addons.join(", ")})` : ""}`
    ),
    "",
    `Total: ${order.currency === "USD" ? "$" : ""}${order.total.toFixed(2)}${order.currency === "LBP" ? " L.L." : ""}`,
    `Customer: ${order.customerName} (${order.customerPhone})`,
    order.orderType === "table"
      ? `Table: ${order.tableNumber ?? "-"}`
      : order.orderType === "delivery"
        ? `Delivery to: ${order.address ?? "-"}`
        : "Pickup",
  ];
  return lines.join("\n");
}

export function buildWhatsAppLink(phoneWithCountryCode: string, message: string): string {
  const digitsOnly = phoneWithCountryCode.replace(/[^0-9]/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}
