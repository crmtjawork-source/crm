import "server-only";
import type { Db } from "../supabaseAdmin";
import { digitsFromChatId } from "../greenApi";
import { findOrCreateConversation, preview } from "../whatsapp";
import { cancelWaitingRunsOnReply } from "../automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

const MEDIA: Record<string, string> = {
  imageMessage: "תמונה",
  videoMessage: "סרטון",
  audioMessage: "הודעה קולית",
  documentMessage: "מסמך",
  stickerMessage: "סטיקר",
  locationMessage: "מיקום",
  contactMessage: "איש קשר",
};

function describe(data: Row = {}): { type: string; body: string } {
  const t: string = data.typeMessage ?? "unknown";
  if (t === "textMessage") return { type: "text", body: data.textMessageData?.textMessage ?? "" };
  if (t === "extendedTextMessage") return { type: "text", body: data.extendedTextMessageData?.text ?? "" };
  if (t === "quotedMessage") return { type: "text", body: data.extendedTextMessageData?.text ?? "" };
  if (t === "reactionMessage") return { type: "reaction", body: `הגיב/ה ${data.extendedTextMessageData?.text ?? ""}`.trim() };
  const caption: string | undefined = data.fileMessageData?.caption;
  const label = MEDIA[t] ?? t;
  return { type: t.replace(/Message$/, ""), body: caption ? `[${label}] ${caption}` : `[${label}]` };
}

// Only chats with people who are already leads are stored: the agent's
// personal WhatsApp also holds friends and family, which don't belong in
// the CRM.
async function contactFor(db: Db, orgId: string, digits: string): Promise<Row | null> {
  const { data } = await db.from("contacts").select("id").eq("org_id", orgId).eq("phone_digits", digits).order("created_at").limit(1).maybeSingle();
  return data;
}

export async function handleGreenApiEvent(db: Db, channel: Row, p: Row): Promise<string | null> {
  const type: string = p.typeWebhook ?? "";
  const at = p.timestamp ? new Date(Number(p.timestamp) * 1000).toISOString() : new Date().toISOString();

  if (type === "stateInstanceChanged") {
    await db.from("channels").update({ status: p.stateInstance ?? null, status_checked_at: new Date().toISOString() }).eq("id", channel.id);
    return null;
  }

  if (type === "outgoingMessageStatus") {
    const next = String(p.status ?? "").toLowerCase();
    const mapped = next === "noaccount" ? "failed" : next;
    if (!(mapped in STATUS_RANK) || !p.idMessage) return null;
    const { data: message } = await db.from("messages").select("id, status").eq("org_id", channel.org_id).eq("external_id", p.idMessage).maybeSingle();
    if (!message) return null;
    if ((STATUS_RANK[message.status] ?? -1) >= STATUS_RANK[mapped] && mapped !== "failed") return null;
    await db
      .from("messages")
      .update({ status: mapped, ...(next === "noaccount" ? { error: "למספר הזה אין וואטסאפ" } : {}) })
      .eq("id", message.id);
    return null;
  }

  // outgoingAPIMessageReceived = our own sends, already stored by sendToContact.
  if (type !== "incomingMessageReceived" && type !== "outgoingMessageReceived") return null;
  const digits = digitsFromChatId(p.senderData?.chatId ?? "");
  if (!digits) return null; // groups, broadcasts
  const contact = await contactFor(db, channel.org_id, digits);
  if (!contact) return null;

  const inbound = type === "incomingMessageReceived";
  const conversation = await findOrCreateConversation(db, { orgId: channel.org_id, channelId: channel.id, contactId: contact.id, waId: digits });
  const { type: msgType, body } = describe(p.messageData);
  const { data: inserted } = await db
    .from("messages")
    .upsert(
      {
        org_id: channel.org_id,
        conversation_id: conversation.id,
        direction: inbound ? "inbound" : "outbound",
        // outbound here = typed by the agent on the phone
        origin: inbound ? null : "phone_app",
        type: msgType,
        body,
        payload: p,
        external_id: p.idMessage,
        status: inbound ? "received" : "sent",
        created_at: at,
      },
      { onConflict: "org_id,external_id", ignoreDuplicates: true }
    )
    .select("id");
  if (!inserted?.length) return null; // redelivery

  if (inbound) {
    await db.rpc("bump_conversation_inbound", { conv_id: conversation.id, at, preview: preview(body) });
    await cancelWaitingRunsOnReply(db, channel.org_id, contact.id);
  } else {
    await db.from("conversations").update({ last_message_at: at, last_message_preview: preview(body) }).eq("id", conversation.id);
  }
  return null;
}
