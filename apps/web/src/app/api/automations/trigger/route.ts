import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { triggerAutomations, type TriggerType } from "@/lib/server/automations";

const TYPES: TriggerType[] = ["new_contact", "stage_change", "tag_added"];

// Called by the browser after it creates a lead / adds a tag / moves a deal,
// so UI-originated events run through the same server engine as webhook
// leads (real WhatsApp sends, durable waits).
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as {
      type?: TriggerType;
      contactId?: string;
      ctx?: { pipelineId?: string; stageId?: string; tag?: string };
    };
    if (!body.type || !TYPES.includes(body.type)) throw new HttpError(400, "טריגר לא מוכר");
    if (!body.contactId) throw new HttpError(400, "חסר contactId");

    const { data: contact } = await user.db.from("contacts").select("id, org_id").eq("id", body.contactId).maybeSingle();
    if (!contact) throw new HttpError(404, "הליד לא נמצא");

    const db = supabaseAdmin();
    const since = new Date(Date.now() - 5_000).toISOString();
    const runIds = await triggerAutomations(db, contact.org_id, body.type, contact.id, body.ctx ?? {});
    if (runIds.length === 0) return Response.json({ contact: null, activities: [], notifications: [], runs: [] });

    const [contactRes, activitiesRes, notificationsRes, runsRes] = await Promise.all([
      db.from("contacts").select("*").eq("id", contact.id).single(),
      db.from("activities").select("*").eq("contact_id", contact.id).gte("created_at", since),
      db.from("notifications").select("*").eq("contact_id", contact.id).gte("created_at", since),
      db.from("automation_runs").select("*").in("id", runIds),
    ]);
    return Response.json({
      contact: contactRes.data,
      activities: activitiesRes.data ?? [],
      notifications: notificationsRes.data ?? [],
      runs: runsRes.data ?? [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}
