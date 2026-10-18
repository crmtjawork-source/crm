import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { userGatewayChannel } from "@/lib/server/whatsapp";

// Schedules messages to a lead (meeting reminders) from the signed-in
// agent's linked WhatsApp; the cron job sends them when due.
type Item = { templateId: string; sendAt: string; appointmentId?: string; label: string };

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/schedule">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const db = supabaseAdmin();
    const channel = await userGatewayChannel(db, orgId, user.userId);
    if (!channel) return Response.json({ error: "לא חיברת וואטסאפ אישי", code: "no_gateway" }, { status: 409 });
    const { data: contact } = await db.from("contacts").select("id").eq("id", id).eq("org_id", orgId).maybeSingle();
    if (!contact) throw new HttpError(404, "הליד לא נמצא");

    const { items } = (await request.json()) as { items: Item[] };
    const rows = (items ?? [])
      .filter((i) => i.templateId && !Number.isNaN(Date.parse(i.sendAt)) && Date.parse(i.sendAt) > Date.now())
      .map((i) => ({
        org_id: orgId,
        contact_id: id,
        channel_id: channel.id,
        template_id: i.templateId,
        appointment_id: i.appointmentId ?? null,
        label: i.label.slice(0, 200),
        send_at: new Date(i.sendAt).toISOString(),
        created_by: user.userId,
      }));
    if (!rows.length) return Response.json({ scheduled: [] });
    const { data, error } = await db.from("scheduled_messages").insert(rows).select();
    if (error) throw error;
    return Response.json({ scheduled: data });
  } catch (err) {
    return errorResponse(err);
  }
}
