// =======================================================================
// Server-side Supabase client. Import in server components, route handlers,
// and server actions. Uses the service role key by default for catalog reads
// (all data is public anyway); auth-scoped reads use the anon key.
// =======================================================================

import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || (!serviceKey && !anon)) {
    throw new Error(
      "Supabase env vars are missing. Copy .env.local.example → .env.local and fill in the values.",
    );
  }
  // Validate the URL format up front (Supabase SDK throws a confusing
  // "Invalid supabaseUrl: Provided URL is malformed." otherwise).
  let url: string;
  try {
    url = new URL(rawUrl).toString().replace(/\/$/, "");
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is malformed. It should look like https://xxxxx.supabase.co (no trailing slash or whitespace).",
    );
  }

  // Use service role on the server so we can read/write without RLS friction.
  return createClient(url, serviceKey || anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
