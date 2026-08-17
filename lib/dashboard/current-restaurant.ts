import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRestaurantRow } from "@/lib/supabase/mappers";
import type { Restaurant, StaffRole } from "@/lib/types";

export interface CurrentRestaurant {
  restaurant: Restaurant;
  role: StaffRole;
}

// Wrapped in cache() so every Server Component that calls this during one
// request's render shares a single query instead of one each.
export const getCurrentRestaurant = cache(async (): Promise<CurrentRestaurant | null> => {
  const supabase = createServerSupabaseClient();

  // A stale/invalid refresh-token cookie (e.g. from a revoked or expired
  // session) makes getUser() throw instead of returning { user: null } —
  // treat it the same as "not logged in" rather than crashing the render.
  const user = await supabase.auth.getUser().then(
    ({ data }) => data.user,
    () => null
  );
  if (!user) return null;

  const { data, error } = await supabase
    .from("staff_users")
    .select("role, restaurants(*)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data || !data.restaurants) return null;

  return {
    restaurant: mapRestaurantRow(data.restaurants as unknown as Record<string, unknown>),
    role: data.role as StaffRole,
  };
});
