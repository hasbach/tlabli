// -----------------------------------------------------------------------------
// Browser-side Supabase client. Uses @supabase/ssr so the session cookie is
// shared with middleware.ts — every place in this app that currently reads
// from lib/mock-data.ts is written so it can be swapped for a call through
// this client without changing component code — look for the
// "// TODO(supabase):" comments.
// -----------------------------------------------------------------------------

import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
