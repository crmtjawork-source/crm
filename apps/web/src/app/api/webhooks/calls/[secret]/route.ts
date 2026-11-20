import { after } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { processWebhookEvent } from "@/lib/server/webhooks/process";
import { providerById } from "@/lib/server/telephony/providers";

// Call events from a connected phone system. The secret in the URL identifies
// the org's connection; the provider's own signature then proves the sender.
// Verified events are stored first, acknowledged, and processed afterwards —
// like the other webhooks, so a slow database never makes the provider retry.
// Voicenter wants this exact acknowledgement; harmless for the others.
const ok = () => Response.json({ Err: 0, Errdesc: "" });

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/calls/[secret]">) {
  const { secret } = await ctx.params;
  const db = supabaseAdmin();
  const { data: creds } = await db.from("telephony_credentials").select("connection_id, signing_secret, api_key").eq("webhook_secret", secret).maybeSingle();
  if (!creds) return new Response("Not found", { status: 404 });
  const { data: connection } = await db.from("telephony_connections").select("id, provider, enabled").eq("id", creds.connection_id).single();
  const provider = connection && providerById(connection.provider);
  if (!connection || !provider) return new Response("Not found", { status: 404 });
  if (!connection.enabled) return new Response("Disabled", { status: 403 });

  const rawBody = await request.text();
  if (rawBody.length > 512_000) return new Response("Too large", { status: 413 });
  const req = { rawBody, headers: request.headers, url: request.url };
  if (!provider.verify(req, { signingSecret: creds.signing_secret, apiKey: creds.api_key })) return new Response("Invalid signature", { status: 401 });

  // JSON, or form fields (some phone systems post forms).
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    const form = Object.fromEntries(new URLSearchParams(rawBody));
    if (Object.keys(form).length === 0) return new Response("Bad request", { status: 400 });
    body = form;
  }
  const events = provider.parse(body, req);
  if (events.length === 0) return ok();

  const { data: row, error } = await db
    .from("webhook_events")
    .insert({ source: "calls", payload: { object: "calls", connection_id: connection.id, events } })
    .select("id")
    .single();
  if (error || !row) return new Response("Failed to store", { status: 500 });
  after(() => processWebhookEvent(db, row.id));
  return ok();
}
