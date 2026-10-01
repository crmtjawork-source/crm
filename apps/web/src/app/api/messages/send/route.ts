import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { sendToContact, WindowClosedError, type OutgoingContent } from "@/lib/server/whatsapp";

type Body = {
  conversationId?: string;
  contactId?: string;
  channelId?: string;
  text?: string;
  template?: { name?: string; language?: string; params?: string[]; buttonParam?: string };
};

function parseContent(body: Body): OutgoingContent {
  if (body.template?.name) {
    const name = body.template.name.trim();
    if (!/^[a-z0-9_]+$/.test(name)) throw new HttpError(400, "שם תבנית יכול להכיל רק אותיות קטנות באנגלית, ספרות וקו תחתון");
    return {
      kind: "template",
      name,
      language: body.template.language?.trim() || "he",
      bodyParams: (body.template.params ?? []).map((p) => String(p)),
      ...(body.template.buttonParam?.trim() ? { buttonUrlParam: body.template.buttonParam.trim() } : {}),
    };
  }
  const text = body.text?.trim();
  if (!text) throw new HttpError(400, "ההודעה ריקה");
  if (text.length > 4096) throw new HttpError(400, "ההודעה ארוכה מדי (מקסימום 4096 תווים)");
  return { kind: "text", body: text };
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as Body;
    const content = parseContent(body);

    // Reads go through the user's RLS-scoped client: finding the row is the
    // proof that this user belongs to its org.
    let orgId: string;
    let contactId: string;
    let channelId: string | null = body.channelId ?? null;
    if (body.conversationId) {
      const { data } = await user.db
        .from("conversations")
        .select("org_id, contact_id, channel_id")
        .eq("id", body.conversationId)
        .maybeSingle();
      if (!data) throw new HttpError(404, "השיחה לא נמצאה");
      ({ org_id: orgId, contact_id: contactId } = data);
      channelId = data.channel_id;
    } else if (body.contactId) {
      const { data } = await user.db.from("contacts").select("id, org_id").eq("id", body.contactId).maybeSingle();
      if (!data) throw new HttpError(404, "הליד לא נמצא");
      orgId = data.org_id;
      contactId = data.id;
    } else {
      throw new HttpError(400, "חסר conversationId או contactId");
    }

    if (channelId) {
      const { data: channel } = await user.db.from("channels").select("id").eq("id", channelId).eq("org_id", orgId).maybeSingle();
      if (!channel) throw new HttpError(404, "הערוץ לא נמצא");
    }

    const message = await sendToContact(supabaseAdmin(), {
      orgId,
      contactId,
      channelId,
      content,
      origin: "crm",
      sentBy: user.userId,
    });
    return Response.json({ message });
  } catch (err) {
    if (err instanceof WindowClosedError) return Response.json({ error: err.message, code: "window_closed" }, { status: 409 });
    return errorResponse(err);
  }
}
