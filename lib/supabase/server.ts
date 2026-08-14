// -----------------------------------------------------------------------------
// Server-side Supabase client for Server Components and Server Actions. Reads
// the session from the request's cookies (shared with middleware.ts and the
// browser client via @supabase/ssr). Server Components can't write cookies —
// setAll's try/catch swallows that case; middleware.ts already refreshes the
// session cookie on every /dashboard/* request, so this doesn't lose the
// session. Server Actions CAN write cookies, so the same setAll path works
// there too.
// -----------------------------------------------------------------------------

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./client";

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — cookies are read-only there.
        }
      },
    },
  });
}
