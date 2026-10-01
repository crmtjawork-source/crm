import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let admin: SupabaseClient | null = null;

// Service-role client: bypasses RLS. Only for webhook processing, the
// automation engine and reading credentials — every caller must scope its
// own queries by org_id.
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export type Db = SupabaseClient;
