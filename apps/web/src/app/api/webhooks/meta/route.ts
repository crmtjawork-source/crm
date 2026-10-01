import { after, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { processWebhookEvent } from "@/lib/server/webhooks/process";

// One callback URL for every Meta webhook object this app subscribes to:
// whatsapp_business_account (messages, statuses, Coexistence echoes/history)
// and page (Lead Ads `leadgen`).

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = env.metaWebhookVerifyToken();
  if (params.get("hub.mode") === "subscribe" && expected && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function hasValidSignature(raw: Buffer, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(raw).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  const secret = env.metaAppSecret();
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  // Signature is over the exact bytes Meta sent — hash before any parsing.
  const raw = Buffer.from(await request.arrayBuffer());
  if (!hasValidSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: { object?: string };
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: event, error } = await db
    .from("webhook_events")
    .insert({ source: payload.object ?? "unknown", payload })
    .select("id")
    .single();
  // Not persisted → don't acknowledge; Meta redelivers for ~36h.
  if (error || !event) return new Response("Storage error", { status: 500 });

  after(() => processWebhookEvent(db, event.id));
  return new Response("OK", { status: 200 });
}
