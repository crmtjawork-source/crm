import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Single browser client for the whole app — every page is a client
// component today, so a plain supabase-js client (session persisted to
// localStorage by the library itself) is enough; no SSR cookie handling
// needed yet.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
