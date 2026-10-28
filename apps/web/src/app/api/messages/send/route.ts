import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { sendToContact, sendToConversation, WindowClosedError, type MediaType, type OutgoingContent } from "@/lib/server/whatsapp";
import { env } from "@/lib/server/env";

type Body = {
  conversationId?: string;
  contactId?: string;
  channelId?: string;
  text?: string;
  template?: { name?: string; language?: string; params?: string[]; buttonParam?: string };
  // A file already uploaded to our storage (by public URL).
  media?: { url?: string; mediaType?: MediaType; fileName?: string; caption?: string };
};

// Only files in this project's own storage may be sent.
function checkMediaUrl(url: string) {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new HttpError(400, "כתובת הקובץ לא תקינה");
  }
  if (host !== new URL(env.supabaseUrl()).host) throw new HttpError(400, "אפשר לשלוח רק קבצים שהועלו למערכת");
}

function parseContent(body: Body): OutgoingContent {
  if (body.media?.url) {
    checkMediaUrl(body.media.url);
    const mediaType = body.media.mediaType;
    if (!mediaType || !["image", "video", "gif", "document", "voice"].includes(mediaType)) throw new HttpError(400, "סוג קובץ לא נתמך");
    return { kind: "media", url: body.media.url, mediaType, fileName: body.media.fileName?.slice(0, 200), caption: body.media.caption?.slice(0, 1000) || undefined };
  }
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
    let contactId: string | null;
    let channelId: string | null = body.channelId ?? null;
    let isGroup = false;
    if (body.conversationId) {
      const { data } = await user.db
        .from("conversations")
        .select("org_id, contact_id, channel_id, is_group")
        .eq("id", body.conversationId)
        .maybeSingle();
      if (!data) throw new HttpError(404, "השיחה לא נמצאה");
      ({ org_id: orgId, contact_id: contactId } = data);
      channelId = data.channel_id;
      isGroup = Boolean(data.is_group);
    } else if (body.contactId) {
      const { data } = await user.db.from("contacts").select("id, org_id").eq("id", body.contactId).maybeSingle();
      if (!data) throw new HttpError(404, "הליד לא נמצא");
      orgId = data.org_id;
      contactId = data.id;
    } else {
      throw new HttpError(400, "חסר conversationId או contactId");
    }

    if (channelId) {
      const { data: channel } = await user.db.from("channels").select("id, owner_membership_id").eq("id", channelId).eq("org_id", orgId).maybeSingle();
      if (!channel) throw new HttpError(404, "הערוץ לא נמצא");
      // A colleague's personal WhatsApp is theirs to write from.
      if (channel.owner_membership_id) {
        const { data: me } = await user.db.from("memberships").select("id").eq("org_id", orgId).eq("user_id", user.userId).maybeSingle();
        if (channel.owner_membership_id !== me?.id) throw new HttpError(403, "זו שיחה מהוואטסאפ האישי של איש צוות אחר — אפשר לקרוא אותה, לא לשלוח ממנה");
      }
    }

    // A chat with someone who isn't a lead, or a group: straight to the chat.
    if (body.conversationId && (!contactId || isGroup)) {
      const message = await sendToConversation(supabaseAdmin(), { conversationId: body.conversationId, content, sentBy: user.userId });
      return Response.json({ message });
    }
    if (!contactId) throw new HttpError(400, "לשיחה אין ליד");
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
