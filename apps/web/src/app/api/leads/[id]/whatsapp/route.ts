import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { userGatewayChannel } from "@/lib/server/whatsapp";
import { composeForLead, sendLeadMessage } from "@/lib/server/leadMessages";

// Sends a message to a lead right now from the signed-in agent's linked
// WhatsApp. 409 no_gateway = the agent hasn't linked one (the browser then
// falls back to opening WhatsApp on the phone).
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/whatsapp">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const db = supabaseAdmin();
    const channel = await userGatewayChannel(db, orgId, user.userId);
    if (!channel) return Response.json({ error: "לא חיברת וואטסאפ אישי", code: "no_gateway" }, { status: 409 });
    if (channel.status && channel.status !== "authorized") throw new HttpError(409, "הוואטסאפ שלך מנותק — צריך לסרוק שוב את הקוד בהגדרות");

    const body = (await request.json()) as { templateId?: string; text?: string; appointmentId?: string };
    const { text, templateName } = await composeForLead(db, {
      orgId,
      contactId: id,
      userId: user.userId,
      templateId: body.templateId,
      text: body.text,
      appointmentId: body.appointmentId,
      origin: new URL(request.url).origin,
    });
    const message = await sendLeadMessage(db, { orgId, channelId: channel.id, contactId: id, text, label: `נשלח מהוואטסאפ: ${templateName ?? "הודעה"}`, userId: user.userId, origin: "crm" });
    return Response.json({ message });
  } catch (err) {
    return errorResponse(err);
  }
}
