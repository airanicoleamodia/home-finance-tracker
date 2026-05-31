import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When env vars are missing the app runs in LOCAL MODE (device-only storage).
export const hasSupabase = Boolean(url && key);

export const supabase = hasSupabase
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
