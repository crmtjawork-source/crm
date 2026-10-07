import { after } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { upsertInboundLead } from "@/lib/server/leads";
import { parseIntake } from "@/lib/server/intake";
import { triggerAutomations } from "@/lib/server/automations";

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

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return request.json();
  if (type.includes("form")) return Object.fromEntries((await request.formData()).entries());
  const text = await request.text();
  if (!text.trim()) return {};
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
  });
  if (!lead.phone && !lead.email && !lead.name) {
    return Response.json({ error: "a lead needs at least a name, phone or email" }, { status: 400, headers: CORS });
  }

  try {
    const { contactId, created } = await upsertInboundLead(db, source.org_id, lead);
    await db
      .from("lead_sources")
      .update({ last_received_at: new Date().toISOString(), received_count: (source.received_count ?? 0) + 1 })
      .eq("id", source.id);
    if (created && !lead.isTest) {
      after(() => triggerAutomations(db, source.org_id, "new_contact", contactId, { source: "lead_source" }));
    }
    return Response.json({ ok: true, id: contactId, created }, { headers: CORS });
  } catch (err) {
    console.error("lead intake failed", err);
    return Response.json({ error: "failed to save lead" }, { status: 500, headers: CORS });
  }
}
