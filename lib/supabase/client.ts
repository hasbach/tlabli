// -----------------------------------------------------------------------------
// STUB — not connected yet. This file is intentionally inert until you create
// a Supabase project and set the env vars below (see SETUP_TODO.md, item 1).
//
// Once configured, run:  npm install @supabase/supabase-js
// and uncomment the implementation. Every place in this app that currently
// reads from lib/mock-data.ts is written so it can be swapped for a call
// through this client without changing component code — look for the
// "// TODO(supabase):" comments.
// -----------------------------------------------------------------------------

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
