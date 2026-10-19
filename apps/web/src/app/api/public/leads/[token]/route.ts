import { after } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { upsertInboundLead } from "@/lib/server/leads";
import { parseIntake } from "@/lib/server/intake";
import { triggerAutomations } from "@/lib/server/automations";
import { sendPendingPushes } from "@/lib/server/push";

// Public lead intake: agencies, Google Ads lead forms, Zapier/Make, landing
// pages… POST a lead here. The unguessable token in the URL identifies the
// org and the lead source; it can only add leads. CORS is open so a
// landing page can post straight from the browser.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// "@key=value" lines: for senders that paste raw values into a template
// (e.g. Fireberry automations), where quotes or line breaks in a value
// would break JSON. A line not starting with "@key=" continues the
// previous value.
function parseAtLines(text: string): Record<string, string> | null {
  if (!/^@[^=\n]{1,60}=/m.test(text)) return null;
  const out: Record<string, string> = {};
  let key: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^@([^=]{1,60})=(.*)$/);
    if (m) {
      key = m[1].trim();
      out[key] = m[2];
    } else if (key) {
      out[key] += `\n${line}`;
    }
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("form")) return Object.fromEntries((await request.formData()).entries());
  const text = await request.text();
  if (!text.trim()) return {};
  const lines = parseAtLines(text);
  if (lines) return lines;
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/public/leads/[token]">) {
  const { token } = await ctx.params;
  const db = supabaseAdmin();
  const { data: source } = await db.from("lead_sources").select("*").eq("token", token).maybeSingle();
  if (!source || !source.active) return Response.json({ error: "unknown lead source" }, { status: 404, headers: CORS });

  let body: unknown;
  try {
    body = await readBody(request);
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400, headers: CORS });
  }
  const lead = parseIntake(body, new URL(request.url).searchParams, {
    platform: source.default_platform,
    agency: source.default_agency,
    campaignId: source.default_campaign_id,
    sourceName: source.name,
    fieldMap: source.field_map,
  });
  // Kept so whoever connects a new sender can see exactly what arrived.
  const remember = (error: string | null) => {
    const json = JSON.stringify(body ?? {});
    const payload = json.length <= 20000 ? body : { truncated: true, keys: Object.keys((body ?? {}) as object) };
    return db.from("lead_sources").update({ last_payload: payload, last_error: error }).eq("id", source.id);
  };
  if (!lead.phone && !lead.email && !lead.name) {
    await remember("לא נמצא שם, טלפון או אימייל בנתונים");
    return Response.json({ error: "a lead needs at least a name, phone or email" }, { status: 400, headers: CORS });
  }

  try {
    const { contactId, created } = await upsertInboundLead(db, source.org_id, lead);
    await db
      .from("lead_sources")
      .update({ last_received_at: new Date().toISOString(), received_count: (source.received_count ?? 0) + 1 })
      .eq("id", source.id);
    await remember(null);
    after(() => sendPendingPushes(db));
    if (created && !lead.isTest) {
      after(() => triggerAutomations(db, source.org_id, "new_contact", contactId, { source: "lead_source" }));
    }
    return Response.json({ ok: true, id: contactId, created }, { headers: CORS });
  } catch (err) {
    console.error("lead intake failed", err);
    await remember(err instanceof Error ? err.message : "שמירת הליד נכשלה");
    return Response.json({ error: "failed to save lead" }, { status: 500, headers: CORS });
  }
}
