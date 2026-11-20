import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { releaseHeldSends } from "@/lib/server/automations";
import { loadAutomationDefaults, orgWhatsAppState } from "@/lib/server/waHealth";
import { emailConfigured } from "@/lib/server/email";

// Health + the queue of automation messages waiting for WhatsApp.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const db = supabaseAdmin();
    const [state, defaults, held, scheduled] = await Promise.all([
      orgWhatsAppState(db, orgId),
      loadAutomationDefaults(db, orgId),
      db.from("automation_held_sends").select("id, reason, held_at, status, error, automation_id, contact_id").eq("org_id", orgId).in("status", ["pending", "failed", "expired"]).order("held_at", { ascending: false }).limit(100),
      db.from("scheduled_messages").select("id, label, hold_reason, held_at, send_at, contact_id").eq("org_id", orgId).eq("status", "pending").not("hold_reason", "is", null).limit(100),
    ]);
    const rows = held.data ?? [];
    const [autos, contacts] = await Promise.all([
      db.from("automations").select("id, name").in("id", [...new Set(rows.map((r) => r.automation_id).filter(Boolean))]),
      db.from("contacts").select("id, name").in("id", [...new Set([...rows.map((r) => r.contact_id), ...(scheduled.data ?? []).map((r) => r.contact_id)].filter(Boolean))]),
    ]);
    const autoName = new Map((autos.data ?? []).map((a) => [a.id, a.name]));
    const contactName = new Map((contacts.data ?? []).map((c) => [c.id, c.name]));
    return Response.json({
      state,
      defaults,
      emailConfigured: emailConfigured(),
      held: rows.map((r) => ({ ...r, automationName: autoName.get(r.automation_id) ?? "", contactName: contactName.get(r.contact_id) ?? "" })),
      scheduled: (scheduled.data ?? []).map((r) => ({ ...r, contactName: contactName.get(r.contact_id) ?? "" })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const body = (await request.json()) as { action?: "release" | "cancel" | "defaults"; id?: string; channelMode?: string; fallback?: string; holdExpireHours?: number };
    const db = supabaseAdmin();
    if (body.action === "release") {
      // One click = send everything that is waiting now, through the same claimed path as the cron job.
      const result = await releaseHeldSends(db, { orgId });
      return Response.json(result);
    }
    if (body.action === "cancel") {
      if (!body.id) throw new HttpError(400, "חסר id");
      await db.from("automation_held_sends").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", body.id).eq("org_id", orgId).eq("status", "pending");
      return Response.json({ ok: true });
    }
    if (body.action === "defaults") {
      await requireOrgRole(user, orgId, ["owner", "admin"]);
      const mode = body.channelMode === "auto" ? "auto" : "whatsapp";
      const fallback = ["hold", "task", "notify", "email", "skip"].includes(body.fallback ?? "") ? body.fallback : "hold";
      const hours = Math.min(24 * 30, Math.max(1, Number(body.holdExpireHours) || 72));
      await db.from("organizations").update({ automation_defaults: { channel_mode: mode, fallback, hold_expire_hours: hours } }).eq("id", orgId);
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "פעולה לא מוכרת");
  } catch (err) {
    return errorResponse(err);
  }
}
