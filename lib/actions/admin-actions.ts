"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow, mapSubscriptionRow } from "@/lib/supabase/mappers";
import type { Restaurant, Subscription } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export interface TenantPlanStatusPatch {
  planId: Restaurant["planId"];
  status: Restaurant["status"];
}

export async function updateTenantPlanStatus(
  restaurantId: string,
  patch: TenantPlanStatusPatch
): Promise<ActionResult<Restaurant>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({ plan_id: patch.planId, status: patch.status })
    .eq("id", restaurantId)
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to update plan/status" };
  revalidatePath("/admin");
  return { data: mapRestaurantRow(data) };
}

export interface RecordSubscriptionPaymentInput {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  paymentProofRef?: string;
}

export async function recordSubscriptionPayment(
  input: RecordSubscriptionPaymentInput
): Promise<ActionResult<Subscription>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      restaurant_id: input.restaurantId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      payment_proof_ref: input.paymentProofRef || null,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to record payment" };
  revalidatePath("/admin");
  return { data: mapSubscriptionRow(data) };
}
