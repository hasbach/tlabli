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

// Next 14 caches server-side fetch() in its Data Cache unless something opts
// out. The cookie-based client opts out implicitly (reading cookies makes the
// request dynamic); this one doesn't, and `dynamic = "force-dynamic"` on a
// page does NOT stop fetch caching — so without no-store, driver_get_orders
// was cached for a year and the driver page never saw new/finished orders.
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export function createAnonSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
}
