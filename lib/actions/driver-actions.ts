"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapDriverRow } from "@/lib/supabase/mappers";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import type { Driver } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

// Error codes raised by the RPCs in supabase/sql/15_drivers.sql.
const RPC_ERROR_MESSAGES: Record<string, string> = {
  driver_not_found_or_inactive: "This driver is inactive — reactivate them first.",
  driver_not_found: "That driver no longer exists.",
  driver_inactive: "That driver is inactive — reactivate them in Settings first.",
  order_not_found: "That order no longer exists.",
  not_a_delivery_order: "Only delivery orders can have a driver.",
  order_finished: "This order is already completed or cancelled.",
};

function friendlyError(message: string): string {
  return RPC_ERROR_MESSAGES[message] ?? message;
}

function revalidateDriverViews() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/settings");
}

export async function addDriver(name: string, phone: string): Promise<ActionResult<{ driver: Driver; token: string | null }>> {
  const current = await getCurrentRestaurant();
  if (!current) return { error: "Not authorized" };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("drivers")
    .insert({ restaurant_id: current.restaurant.id, name: name.trim(), phone: phone.trim() })
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to add driver" };

  // The driver row stays even if issuing the link fails — the owner can
  // retry with "Reset link", so token is nullable instead of rolling back.
  const { data: token, error: tokenError } = await supabase.rpc("reset_driver_link", { p_driver_id: data.id });
  const issued = !tokenError && typeof token === "string" ? token : null;

  revalidateDriverViews();
  return {
    data: {
      driver: { ...mapDriverRow(data), linkCreatedAt: issued ? new Date().toISOString() : undefined },
      token: issued,
    },
  };
}

export async function updateDriver(driverId: string, name: string, phone: string): Promise<ActionResult<Driver>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("drivers")
    .update({ name: name.trim(), phone: phone.trim() })
    .eq("id", driverId)
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to update driver" };
  revalidateDriverViews();
  return { data: mapDriverRow(data) };
}

export async function resetDriverLink(driverId: string): Promise<ActionResult<{ token: string; linkCreatedAt: string }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("reset_driver_link", { p_driver_id: driverId });
  if (error || typeof data !== "string") return { error: friendlyError(error?.message ?? "Failed to reset link") };
  revalidateDriverViews();
  return { data: { token: data, linkCreatedAt: new Date().toISOString() } };
}

export async function setDriverActive(driverId: string, active: boolean): Promise<ActionResult<{ unassigned: number }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_driver_active", { p_driver_id: driverId, p_active: active });
  if (error) return { error: friendlyError(error.message) };
  revalidateDriverViews();
  return { data: { unassigned: Number(data ?? 0) } };
}

export async function assignOrderDriver(orderId: string, driverId: string | null): Promise<ActionResult<true>> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("assign_order_driver", { p_order_id: orderId, p_driver_id: driverId });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { data: true };
}
