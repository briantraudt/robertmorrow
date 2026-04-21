// =======================================================================
// Browser-side Supabase client. Safe to import from client components.
// =======================================================================
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // Return a stub so the app doesn't crash during development without env vars.
    return null;
  }
  return createBrowserClient(url, anon);
}
