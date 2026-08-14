// -----------------------------------------------------------------------------
// Service-role Supabase client. Used ONLY by staff-account creation
// (lib/actions/staff-actions.ts) — creating an auth.users row isn't something
// Postgres RLS can gate, so this is the one deliberate exception to "ordinary
// writes use the RLS-scoped server client." Never import this from a
// "use client" file — SUPABASE_SERVICE_ROLE_KEY must never reach the browser.
// -----------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./client";

export function createAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
