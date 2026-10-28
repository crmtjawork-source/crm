import "server-only";
import type { Db } from "./supabaseAdmin";
import { graphFetch, GraphError } from "./graph";
import { sendText as greenApiSendText, sendFile as greenApiSendFile } from "./greenApi";
import { sendText as evolutionSendText, sendMedia as evolutionSendMedia, sendVoice as evolutionSendVoice } from "./evolution";

export type MediaType = "image" | "video" | "gif" | "document" | "voice";

export type OutgoingContent =
  | { kind: "text"; body: string }
  // A file by public URL; a voice note can't carry a caption.
  | { kind: "media"; url: string; mediaType: MediaType; fileName?: string; caption?: string }
  | {
      kind: "template";
      name: string;
      language: string;
      bodyParams: string[];
      // Suffix for a dynamic URL button; sent for button index 0.
      buttonUrlParam?: string;
    };

export type MessageOrigin = "crm" | "automation" | "phone_app" | "history";

export class WindowClosedError extends Error {
  constructor() {
    super("עברו יותר מ-24 שעות מההודעה האחרונה של הליד — וואטסאפ מאפשר רק הודעת תבנית מאושרת.");
  }
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastInboundAt: string | null | undefined): boolean {
  return !!lastInboundAt && Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

export function preview(text: string | null | undefined): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MEDIA_LABELS: Record<string, string> = {
  image: "תמונה",
  video: "סרטון",
  audio: "הודעה קולית",
  voice: "הודעה קולית",
  document: "מסמך",
  sticker: "סטיקר",
  location: "מיקום",
  contacts: "איש קשר",
};

// Turns any WhatsApp message object (inbound, echo or history) into the
// type + human-readable body we store and show in the inbox.
export function describeWhatsAppMessage(msg: Row): { type: string; body: string } {
  const type: string = msg.type ?? "unknown";
  switch (type) {
    case "text":
      return { type, body: msg.text?.body ?? "" };
    case "button":
      return { type, body: msg.button?.text ?? "" };
    case "interactive":
      return {
        type,
        body: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "[תגובה אינטראקטיבית]",
      };
    case "reaction":
      return { type, body: msg.reaction?.emoji ? `הגיב/ה ${msg.reaction.emoji}` : "[תגובה]" };
    case "template":
      return { type, body: `[תבנית] ${msg.template?.name ?? ""}`.trim() };
    default: {
      const caption: string | undefined = msg[type]?.caption;
      const label = MEDIA_LABELS[type] ?? type;
      return { type, body: caption ? `[${label}] ${caption}` : `[${label}]` };
    }
  }
}

// A specific channel when given; otherwise the org's default official
// (Cloud API) number.
export async function resolveChannel(db: Db, orgId: string, channelId?: string | null): Promise<Row> {
  let query = db.from("channels").select("*").eq("org_id", orgId).eq("active", true);
  if (channelId) {
    query = query.eq("id", channelId);
  } else {
    query = query.eq("provider", "whatsapp_cloud").order("is_default", { ascending: false }).order("created_at");
  }
  const { data } = await query.limit(1).maybeSingle();
  if (!data) throw new Error(channelId ? "ערוץ הוואטסאפ שנבחר לא קיים או לא פעיל" : "לא הוגדר ערוץ וואטסאפ פעיל (הגדרות ← ערוצים)");
  return data;
}

// The WhatsApp the user linked through the gateway (their own number), if any.
export async function userGatewayChannel(db: Db, orgId: string, userId: string): Promise<Row | null> {
  const { data: membership } = await db.from("memberships").select("id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (!membership) return null;
  const { data } = await db
    .from("channels")
    .select("*")
    .eq("org_id", orgId)
    .in("provider", ["green_api", "evolution"])
    .eq("owner_membership_id", membership.id)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}

// Which linked WhatsApp a member sends from: a requested one they may use
// (their own or the business's shared number), else their own, else the
// business's shared default.
export async function senderChannel(db: Db, orgId: string, userId: string, requestedId?: string | null): Promise<Row | null> {
  const { data: membership } = await db.from("memberships").select("id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (!membership) return null;
  if (requestedId) {
    const { data } = await db.from("channels").select("*").eq("id", requestedId).eq("org_id", orgId).eq("active", true).in("provider", ["green_api", "evolution"]).maybeSingle();
    if (!data) return null;
    if (data.owner_membership_id && data.owner_membership_id !== membership.id) throw new Error("אפשר לשלוח רק מהמספר שלך או ממספר העסק");
    return data;
  }
  const own = await userGatewayChannel(db, orgId, userId);
  if (own) return own;
  const { data: shared } = await db
    .from("channels")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true)
    .is("owner_membership_id", null)
    .in("provider", ["green_api", "evolution"])
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  return shared;
}

async function gatewayCreds(db: Db, channel: Row) {
  const { data } = await db.from("channel_credentials").select("access_token, api_url").eq("channel_id", channel.id).maybeSingle();
  if (!data) throw new Error("לחיבור הוואטסאפ הזה אין פרטי גישה שמורים");
  return { idInstance: channel.external_id as string, apiToken: data.access_token as string, apiUrl: data.api_url as string };
}

async function channelToken(db: Db, channelId: string): Promise<string> {
  const { data } = await db.from("channel_credentials").select("access_token").eq("channel_id", channelId).maybeSingle();
  if (!data) throw new Error("לערוץ הזה אין טוקן גישה שמור");
  return data.access_token;
}

export async function findOrCreateConversation(
  db: Db,
  args: { orgId: string; channelId: string; contactId: string; waId: string }
): Promise<Row> {
  const existing = await db
    .from("conversations")
    .select("*")
    .eq("channel_id", args.channelId)
    .eq("external_thread_id", args.waId)
    .maybeSingle();
  if (existing.data) return existing.data;

  const inserted = await db
    .from("conversations")
    .insert({ org_id: args.orgId, channel_id: args.channelId, contact_id: args.contactId, external_thread_id: args.waId })
    .select()
    .single();
  if (inserted.data) return inserted.data;

  // Lost a race with a concurrent webhook for the same thread — the row exists now.
  const retry = await db
    .from("conversations")
    .select("*")
    .eq("channel_id", args.channelId)
    .eq("external_thread_id", args.waId)
    .single();
  if (!retry.data) throw inserted.error ?? new Error("יצירת שיחה נכשלה");
  return retry.data;
}

function templateComponents(content: Extract<OutgoingContent, { kind: "template" }>) {
  const components: Array<Record<string, unknown>> = [];
  if (content.bodyParams.length) {
    components.push({ type: "body", parameters: content.bodyParams.map((text) => ({ type: "text", text })) });
  }
  if (content.buttonUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: content.buttonUrlParam }],
    });
  }
  return components;
}

async function callSendApi(phoneNumberId: string, token: string, to: string, content: OutgoingContent): Promise<string> {
  const components = content.kind === "template" ? templateComponents(content) : [];
  const media =
    content.kind === "media"
      ? content.mediaType === "voice"
        ? { type: "audio", audio: { link: content.url } }
        : {
            type: content.mediaType === "gif" ? "video" : content.mediaType,
            [content.mediaType === "gif" ? "video" : content.mediaType]: {
              link: content.url,
              ...(content.caption ? { caption: content.caption } : {}),
              ...(content.mediaType === "document" && content.fileName ? { filename: content.fileName } : {}),
            },
          }
      : null;
  const body =
    content.kind === "text"
      ? { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: content.body, preview_url: true } }
      : media
      ? { messaging_product: "whatsapp", recipient_type: "individual", to, ...media }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: (content as Extract<OutgoingContent, { kind: "template" }>).name,
            language: { code: (content as Extract<OutgoingContent, { kind: "template" }>).language },
            ...(components.length ? { components } : {}),
          },
        };
  const res = await graphFetch<{ messages?: Array<{ id: string }> }>(`${phoneNumberId}/messages`, token, {
    method: "POST",
    body,
  });
  const wamid = res.messages?.[0]?.id;
  if (!wamid) throw new GraphError("וואטסאפ לא החזיר מזהה הודעה");
  return wamid;
}

export async function sendToContact(
  db: Db,
  args: {
    orgId: string;
    contactId: string;
    channelId?: string | null;
    content: OutgoingContent;
    origin: MessageOrigin;
    sentBy?: string | null;
  }
): Promise<Row> {
  const { data: contact } = await db
    .from("contacts")
    .select("id, name, phone_digits")
    .eq("id", args.contactId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!contact) throw new Error("הליד לא נמצא");
  if (!contact.phone_digits) throw new Error("לליד אין מספר טלפון");

  const channel = await resolveChannel(db, args.orgId, args.channelId);
  const conversation = await findOrCreateConversation(db, {
    orgId: args.orgId,
    channelId: channel.id,
    contactId: contact.id,
    waId: contact.phone_digits,
  });
  const gateway = channel.provider === "green_api" || channel.provider === "evolution";
  // The 24-hour rule and templates are Cloud API rules; a linked personal
  // WhatsApp sends plain text any time.
  if (gateway && args.content.kind === "template") throw new Error("בחיבור וואטסאפ אישי לא שולחים תבנית של מטא");
  if (!gateway && args.content.kind !== "template" && !isWindowOpen(conversation.last_inbound_at)) throw new WindowClosedError();

  const c = args.content;
  const body =
    c.kind === "text"
      ? c.body
      : c.kind === "media"
      ? `[${MEDIA_LABELS[c.mediaType === "gif" ? "video" : c.mediaType]}]${c.caption ? ` ${c.caption}` : ""}`
      : `[תבנית: ${c.name}]${c.bodyParams.length ? ` ${c.bodyParams.join(" · ")}` : ""}`;
  const base = {
    org_id: args.orgId,
    conversation_id: conversation.id,
    direction: "outbound",
    origin: args.origin,
    type: c.kind === "media" ? (c.mediaType === "voice" ? "audio" : c.mediaType === "gif" ? "video" : c.mediaType) : c.kind,
    body,
    payload: args.content,
    sent_by: args.sentBy ?? null,
  };

  let wamid: string;
  try {
    const to = contact.phone_digits;
    if (channel.provider === "evolution") {
      wamid =
        c.kind !== "media" ? await evolutionSendText(channel.external_id, to, (c as { body: string }).body)
        : c.mediaType === "voice" ? await evolutionSendVoice(channel.external_id, to, c.url)
        : await evolutionSendMedia(channel.external_id, to, c.url, c.mediaType === "gif" ? "video" : c.mediaType, c.caption, c.fileName, c.mediaType === "gif");
    } else if (gateway) {
      const creds = await gatewayCreds(db, channel);
      wamid =
        c.kind !== "media" ? await greenApiSendText(creds, to, (c as { body: string }).body)
        : await greenApiSendFile(creds, to, c.url, c.fileName || c.url.split("/").pop() || "file", c.caption);
    } else {
      const token = await channelToken(db, channel.id);
      wamid = await callSendApi(channel.external_id, token, contact.phone_digits, args.content);
    }
  } catch (err) {
    await db.from("messages").insert({ ...base, status: "failed", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const now = new Date().toISOString();
  const { data: message, error } = await db
    .from("messages")
    .insert({ ...base, status: "sent", external_id: wamid, created_at: now })
    .select()
    .single();
  if (error) throw error;
  await db
    .from("conversations")
    .update({ last_message_at: now, last_message_preview: preview(body) })
    .eq("id", conversation.id);
  return message;
}

// A message into any chat of a linked number — including chats with people who
// aren't leads, and groups (WhatsApp Web style). `to` is the phone number or
// the group id.
export async function sendToConversation(
  db: Db,
  args: { conversationId: string; content: OutgoingContent; sentBy?: string | null }
): Promise<Row> {
  const { data: conversation } = await db.from("conversations").select("*").eq("id", args.conversationId).single();
  if (!conversation) throw new Error("השיחה לא נמצאה");
  const { data: channel } = await db.from("channels").select("*").eq("id", conversation.channel_id).single();
  if (!channel) throw new Error("הערוץ לא נמצא");
  if (channel.provider !== "evolution") throw new Error("שליחה לשיחה כזו נתמכת רק בחיבור וואטסאפ של המערכת");
  const c = args.content;
  if (c.kind === "template") throw new Error("תבניות של מטא לא נשלחות מחיבור אישי");

  const to = conversation.external_thread_id as string;
  const body = c.kind === "text" ? c.body : `[${MEDIA_LABELS[c.mediaType === "gif" ? "video" : c.mediaType]}]${c.caption ? ` ${c.caption}` : ""}`;
  const base = {
    org_id: conversation.org_id,
    conversation_id: conversation.id,
    direction: "outbound",
    origin: "crm",
    type: c.kind === "media" ? (c.mediaType === "voice" ? "audio" : c.mediaType === "gif" ? "video" : c.mediaType) : "text",
    body,
    payload: null,
    sent_by: args.sentBy ?? null,
  };
  let wamid: string;
  try {
    wamid =
      c.kind === "text" ? await evolutionSendText(channel.external_id, to, c.body)
      : c.mediaType === "voice" ? await evolutionSendVoice(channel.external_id, to, c.url)
      : await evolutionSendMedia(channel.external_id, to, c.url, c.mediaType === "gif" ? "video" : c.mediaType, c.caption, c.fileName, c.mediaType === "gif");
  } catch (err) {
    await db.from("messages").insert({ ...base, status: "failed", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  const now = new Date().toISOString();
  const { data: message, error } = await db
    .from("messages")
    .insert({ ...base, status: "sent", external_id: wamid, created_at: now, media_mime: null })
    .select()
    .single();
  if (error) throw error;
  await db.from("conversations").update({ last_message_at: now, last_message_preview: preview(body) }).eq("id", conversation.id);
  return message;
}
