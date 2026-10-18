import { after } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { processWebhookEvent } from "@/lib/server/webhooks/process";

// Green-API instance webhooks. The secret in the URL (one per channel,
// never shown to the browser) identifies and authenticates the instance.
// Persist first, answer 200, process after — same as the Meta webhook.
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/green-api/[secret]">) {
  const { secret } = await ctx.params;
  const db = supabaseAdmin();
  const { data: creds } = await db.from("channel_credentials").select("channel_id").eq("webhook_secret", secret).maybeSingle();
  if (!creds) return new Response("Not found", { status: 404 });

  let event: unknown;
  try {
    event = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { data: row, error } = await db
    .from("webhook_events")
    .insert({ source: "green_api", payload: { object: "green_api", channel_id: creds.channel_id, event } })
    .select("id")
    .single();
  if (error || !row) return new Response("Failed to store", { status: 500 });
  after(() => processWebhookEvent(db, row.id));
  return new Response("OK");
}
