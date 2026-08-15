"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapStaffUserRow } from "@/lib/supabase/mappers";
import { getCurrentRestaurant } from "@/lib/dashboard/current-restaurant";
import type { StaffRole, StaffUser } from "@/lib/types";

export type ActionResult<T> = { error: string } | { data: T };

export interface NewStaffInput {
  restaurantId: string;
  name: string;
  phone: string;
  role: StaffRole;
  email: string;
  password: string;
}

export async function addStaffMember(input: NewStaffInput): Promise<ActionResult<StaffUser>> {
  const current = await getCurrentRestaurant();
  if (!current || current.restaurant.id !== input.restaurantId) {
    return { error: "Not authorized" };
  }

  const admin = createAdminSupabaseClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Failed to create login" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("staff_users")
    .insert({
      restaurant_id: input.restaurantId,
      auth_user_id: created.user.id,
      name: input.name,
      phone: input.phone,
      role: input.role,
    })
    .select()
    .single();

  if (error || !data) {
    // Roll back the just-created login so it isn't left orphaned with no restaurant.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: error?.message ?? "Failed to add team member" };
  }

  revalidatePath("/dashboard/settings");
  return { data: mapStaffUserRow(data) };
}

export async function removeStaffMember(staffUserId: string): Promise<ActionResult<true>> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("staff_users").delete().eq("id", staffUserId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { data: true };
}

export async function updateStaffRole(staffUserId: string, role: StaffRole): Promise<ActionResult<StaffUser>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("staff_users")
    .update({ role })
    .eq("id", staffUserId)
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to update role" };
  revalidatePath("/dashboard/settings");
  return { data: mapStaffUserRow(data) };
}
