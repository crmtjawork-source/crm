import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  metaAppSecret: () => process.env.META_APP_SECRET || null,
  metaWebhookVerifyToken: () => process.env.META_WEBHOOK_VERIFY_TOKEN || null,
  metaAppId: () => process.env.META_APP_ID || null,
  cronSecret: () => process.env.CRON_SECRET || null,
  // v20 is retired on 2026-09-24; keep this pinned and bump deliberately.
  graphVersion: () => process.env.META_GRAPH_VERSION || "v25.0",
};
