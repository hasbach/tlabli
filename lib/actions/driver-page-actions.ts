"use server";

import { createAnonSupabaseClient } from "@/lib/supabase/anon";

export type DriverActionCode = "invalid_link" | "not_assigned" | "bad_status" | "unknown";
export type DriverActionResult = { ok: true } | { ok: false; code: DriverActionCode };

const KNOWN_CODES: DriverActionCode[] = ["invalid_link", "not_assigned", "bad_status"];

async function callDriverRpc(
  fn: "driver_mark_picked_up" | "driver_mark_delivered",
  token: string,
  orderId: string
): Promise<DriverActionResult> {
  const supabase = createAnonSupabaseClient();
  const { error } = await supabase.rpc(fn, { p_token: token, p_order_id: orderId });
  if (!error) return { ok: true };
  const code = KNOWN_CODES.find((c) => c === error.message) ?? "unknown";
  if (code === "unknown") console.error(`${fn} failed:`, error.message);
  return { ok: false, code };
}

export async function markPickedUp(token: string, orderId: string): Promise<DriverActionResult> {
  return callDriverRpc("driver_mark_picked_up", token, orderId);
}

export async function markDelivered(token: string, orderId: string): Promise<DriverActionResult> {
  return callDriverRpc("driver_mark_delivered", token, orderId);
}
