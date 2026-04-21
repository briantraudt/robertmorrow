// =======================================================================
// Server-side Supabase client. Import in server components, route handlers,
// and server actions. Uses the service role key by default for catalog reads
// (all data is public anyway); auth-scoped reads use the anon key.
// =======================================================================

import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || (!serviceKey && !anon)) {
    throw new Error(
      "Supabase env vars are missing. Copy .env.local.example → .env.local and fill in the values.",
    );
  }

  // Use service role on the server so we can read/write without RLS friction.
  return createClient(url, serviceKey || anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
