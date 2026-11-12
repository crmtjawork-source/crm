import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { userGatewayChannel } from "@/lib/server/whatsapp";

// Schedules messages to a lead (meeting reminders) from the signed-in
// agent's linked WhatsApp; the cron job sends them when due.
// Either a ready-made template or free text (written in a chat), sent at sendAt.
type Item = { templateId?: string; text?: string; sendAt: string; appointmentId?: string; label: string };

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/schedule">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const db = supabaseAdmin();
    const { items, channelId } = (await request.json()) as { items: Item[]; channelId?: string };
    // A chat schedules from its own number (a linked WhatsApp of this org); otherwise the agent's personal one.
    let channel: { id: string } | null = null;
    if (channelId) {
      const { data: ch } = await db.from("channels").select("id, provider").eq("id", channelId).eq("org_id", orgId).eq("active", true).maybeSingle();
      if (ch && (ch.provider === "evolution" || ch.provider === "green_api")) channel = ch;
    }
    channel ??= (await userGatewayChannel(db, orgId, user.userId)) as { id: string } | null;
    if (!channel) return Response.json({ error: "לא חיברת וואטסאפ אישי", code: "no_gateway" }, { status: 409 });
    const { data: contact } = await db.from("contacts").select("id").eq("id", id).eq("org_id", orgId).maybeSingle();
    if (!contact) throw new HttpError(404, "הליד לא נמצא");

    const rows = (items ?? [])
      .filter((i) => (i.templateId || i.text?.trim()) && !Number.isNaN(Date.parse(i.sendAt)) && Date.parse(i.sendAt) > Date.now())
      .map((i) => ({
        org_id: orgId,
        contact_id: id,
        channel_id: channel.id,
        template_id: i.templateId ?? null,
        body: i.templateId ? null : i.text!.trim().slice(0, 4000),
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
