// -----------------------------------------------------------------------------
// WhatsApp Cloud API notification sending + availability. Reads
// whatsapp_settings/whatsapp_message_log via the service-role client (see
// supabase/sql/08_whatsapp.sql for why) — this module is called both from an
// anonymous storefront page render (getWhatsAppCloudApiAvailability) and an
// anonymous checkout Server Action (sendWhatsAppCloudApiNotification).
//
// Both functions independently check "is Cloud API actually configured"
// (platform env vars present, or BYO credentials present) using the exact
// same conditions — if they ever disagreed, a restaurant could be told
// "Cloud API will handle this" (skipping the deep link) while the send
// itself silently can't run, losing the notification entirely. That must
// never happen; a duplicate notification is fine, a missing one is not.
// -----------------------------------------------------------------------------

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapWhatsAppSettingsRow } from "@/lib/supabase/mappers";
import { beirutStartOfMonth } from "@/lib/beirut-time";
import type { Order, Restaurant } from "@/lib/types";

const PLAN_CAPS: Record<Restaurant["planId"], number | null> = {
  free: 0,
  basic: 20,
  pro: 50,
  custom: null, // unlimited
};

const TEMPLATE_NAME = "new_order_notification";
const TEMPLATE_LANGUAGE = "en";

async function getSentCountThisMonth(restaurantId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const startOfMonth = beirutStartOfMonth(new Date()).toISOString();
  const { count } = await admin
    .from("whatsapp_message_log")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("status", "sent")
    .gte("created_at", startOfMonth);
  return count ?? 0;
}

export async function getWhatsAppCloudApiAvailability(
  restaurantId: string,
  planId: Restaurant["planId"]
): Promise<boolean> {
  try {
    const admin = createAdminSupabaseClient();
    const { data } = await admin.from("whatsapp_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
    const settings = data ? mapWhatsAppSettingsRow(data) : null;

    if (settings?.mode === "own") {
      return Boolean(settings.ownAccessToken && settings.ownPhoneNumberId);
    }

    if (!process.env.WHATSAPP_CLOUD_API_TOKEN || !process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID) return false;

    const cap = PLAN_CAPS[planId];
    if (cap === null) return true;
    if (cap === 0) return false;
    const sentThisMonth = await getSentCountThisMonth(restaurantId);
    return sentThisMonth < cap;
  } catch (err) {
    console.error(`getWhatsAppCloudApiAvailability failed unexpectedly for restaurant ${restaurantId}:`, err);
    return false;
  }
}

// Meta rejects template body parameters that contain newlines/tabs, runs of
// more than 4 spaces, or exceed 1024 chars. Every element returned by
// buildTemplateParams passes through this before being sent.
function sanitizeTemplateParam(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1024);
}

function buildTemplateParams(
  order: Pick<Order, "items" | "total" | "currency" | "customerName" | "customerPhone" | "orderType" | "tableNumber" | "address">,
  restaurantName: string
): string[] {
  const itemLines = order.items
    .map((i) => `${i.quantity}x ${i.title}${i.addons.length ? ` (${i.addons.join(", ")})` : ""}`)
    .join(" • ");
  const total = `${order.currency === "USD" ? "$" : ""}${order.total.toFixed(2)}${order.currency === "LBP" ? " L.L." : ""}`;
  const customer = `${order.customerName} (${order.customerPhone})`;
  const fulfillment =
    order.orderType === "table"
      ? `Table: ${order.tableNumber ?? "-"}`
      : order.orderType === "delivery"
        ? `Delivery to: ${order.address ?? "-"}`
        : "Pickup";

  return [restaurantName, itemLines, total, customer, fulfillment].map(sanitizeTemplateParam);
}

async function callMetaCloudApi(
  accessToken: string,
  phoneNumberId: string,
  toPhoneNumber: string,
  templateParams: string[]
): Promise<void> {
  const digitsOnly = toPhoneNumber.replace(/[^0-9]/g, "");
  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: digitsOnly,
      type: "template",
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANGUAGE },
        components: [
          {
            type: "body",
            parameters: templateParams.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta Cloud API responded ${response.status}: ${body}`);
  }
}

export async function sendWhatsAppCloudApiNotification(
  restaurantId: string,
  orderId: string,
  order: Pick<Order, "items" | "total" | "currency" | "customerName" | "customerPhone" | "orderType" | "tableNumber" | "address">
): Promise<{ sent: boolean }> {
  try {
    const admin = createAdminSupabaseClient();

    const [{ data: restaurantRow }, { data: settingsRow }] = await Promise.all([
      admin.from("restaurants").select("name, whatsapp_number, plan_id").eq("id", restaurantId).maybeSingle(),
      admin.from("whatsapp_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
    ]);

    if (!restaurantRow) return { sent: false };

    const restaurantName = restaurantRow.name as string;
    const restaurantWhatsappNumber = restaurantRow.whatsapp_number as string;
    const planId = restaurantRow.plan_id as Restaurant["planId"];
    const settings = settingsRow ? mapWhatsAppSettingsRow(settingsRow) : null;
    const mode = settings?.mode ?? "tlabli";

    async function log(status: string, errorMessage?: string) {
      await admin.from("whatsapp_message_log").insert({
        restaurant_id: restaurantId,
        order_id: orderId,
        status,
        error_message: errorMessage ?? null,
      });
    }

    let accessToken: string | undefined;
    let phoneNumberId: string | undefined;

    if (mode === "own") {
      accessToken = settings?.ownAccessToken;
      phoneNumberId = settings?.ownPhoneNumberId;
      if (!accessToken || !phoneNumberId) {
        await log("skipped_not_configured");
        return { sent: false };
      }
    } else {
      accessToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
      phoneNumberId = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
      if (!accessToken || !phoneNumberId) {
        await log("skipped_not_configured");
        return { sent: false };
      }
      const cap = PLAN_CAPS[planId];
      if (cap !== null) {
        const sentThisMonth = await getSentCountThisMonth(restaurantId);
        if (sentThisMonth >= cap) {
          await log("skipped_over_cap");
          return { sent: false };
        }
      }
    }

    try {
      const templateParams = buildTemplateParams(order, restaurantName);
      await callMetaCloudApi(accessToken, phoneNumberId, restaurantWhatsappNumber, templateParams);
      await log("sent");
      return { sent: true };
    } catch (err) {
      await log("failed", err instanceof Error ? err.message : "Unknown error");
      return { sent: false };
    }
  } catch (err) {
    // Outer safety net: covers failures before/around the inner try (e.g.
    // createAdminSupabaseClient() throwing on a missing service-role key, or
    // the initial Supabase queries failing). Do NOT attempt a log() insert
    // here — the same client construction that may have failed is what the
    // logger would use.
    console.error(`sendWhatsAppCloudApiNotification failed unexpectedly for order ${orderId}:`, err);
    return { sent: false };
  }
}
