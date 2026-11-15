import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { senderChannel } from "@/lib/server/whatsapp";
import { composeForLead, sendLeadMessage } from "@/lib/server/leadMessages";

// Sends a message to a lead right now from the signed-in member's linked
// WhatsApp or the business's shared number (channelId picks one). 409
// no_gateway = neither is linked (the browser then opens WhatsApp on the phone).
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/whatsapp">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const db = supabaseAdmin();
    const body = (await request.json()) as { templateId?: string; text?: string; appointmentId?: string; channelId?: string; force?: boolean };
    const channel = await senderChannel(db, orgId, user.userId, body.channelId);
    if (!channel) return Response.json({ error: "אין וואטסאפ מחובר לשליחה", code: "no_gateway" }, { status: 409 });
    if (channel.status && channel.status !== "authorized") throw new HttpError(409, "הוואטסאפ הזה מנותק — צריך לסרוק שוב את הקוד בהגדרות");
    const { text, templateName, attachment } = await composeForLead(db, {
      orgId,
      contactId: id,
      userId: user.userId,
      templateId: body.templateId,
      text: body.text,
      appointmentId: body.appointmentId,
      origin: new URL(request.url).origin,
    });
    // The same text to the same lead a moment ago (a slow send that looked like a failure, a double click):
    // ask before sending it again.
    if (!body.force && text.trim()) {
      const { data: convs } = await db.from("conversations").select("id").eq("channel_id", channel.id).eq("contact_id", id);
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length) {
        const { data: recent } = await db
          .from("messages")
          .select("id")
          .in("conversation_id", ids)
          .eq("direction", "outbound")
          .eq("body", text.trim())
          .gt("created_at", new Date(Date.now() - 3 * 60_000).toISOString())
          .limit(1);
        if (recent?.length) return Response.json({ error: "ההודעה הזו כבר נשלחה ללקוח לפני רגע.", code: "duplicate" }, { status: 409 });
      }
    }
    const message = await sendLeadMessage(db, { orgId, channelId: channel.id, contactId: id, text, attachment, label: `נשלח מהוואטסאפ: ${templateName ?? "הודעה"}`, userId: user.userId, origin: "crm" });
    return Response.json({ message });
  } catch (err) {
    return errorResponse(err);
  }
}
