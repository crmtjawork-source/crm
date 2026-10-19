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
  // Public address of the app (links inside messages sent by automations).
  appUrl: () => (process.env.APP_URL || "https://crm-crmtja.vercel.app").replace(/\/+$/, ""),
  // Web Push. The subject is the app's URL, the contact push services see.
  vapidPublicKey: () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
  vapidPrivateKey: () => process.env.VAPID_PRIVATE_KEY || null,
  vapidSubject: () => process.env.VAPID_SUBJECT || "https://crm-crmtja.vercel.app",
  // Google Calendar (OAuth client from Google Cloud Console).
  googleClientId: () => process.env.GOOGLE_CLIENT_ID || null,
  googleClientSecret: () => process.env.GOOGLE_CLIENT_SECRET || null,
  // Evolution API server (self-hosted WhatsApp gateway) shared by all orgs.
  evolutionUrl: () => process.env.EVOLUTION_URL || null,
  evolutionApiKey: () => process.env.EVOLUTION_API_KEY || null,
  // Signs the OAuth "state" so a callback can't be forged.
  oauthStateSecret: () => process.env.OAUTH_STATE_SECRET || null,
};
