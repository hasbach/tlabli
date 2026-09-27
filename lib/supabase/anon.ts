// -----------------------------------------------------------------------------
// Sessionless Supabase client for server code that must never read or write
// the request's auth cookies — e.g. the driver magic-link page, where the
// token (not a session) is the credential. Reads env vars directly instead of
// importing lib/supabase/client.ts, since that module creates a browser
// client singleton (via createBrowserClient) as a side effect of import.
// -----------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function createAnonSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
