"use client";

import { createBrowserClient } from "@supabase/ssr";

let cachedBrowser = null;

export function getSupabaseBrowser() {
  if (cachedBrowser) return cachedBrowser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public credentials are missing.");
  }
  cachedBrowser = createBrowserClient(url, anonKey);
  return cachedBrowser;
}
