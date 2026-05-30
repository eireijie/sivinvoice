import { createClient } from "@supabase/supabase-js";

let cachedAdmin = null;

export function getSupabaseAdmin() {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase admin credentials are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  cachedAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });
  return cachedAdmin;
}

export function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || "invoices";
}
