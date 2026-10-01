import "server-only";
import type { Db } from "./supabaseAdmin";
import { graphFetch, GraphError } from "./graph";

export type OutgoingContent =
  | { kind: "text"; body: string }
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

export async function resolveChannel(db: Db, orgId: string, channelId?: string | null): Promise<Row> {
  let query = db.from("channels").select("*").eq("org_id", orgId).eq("active", true).eq("provider", "whatsapp_cloud");
  if (channelId) {
    query = query.eq("id", channelId);
  } else {
    query = query.order("is_default", { ascending: false }).order("created_at");
  }
  const { data } = await query.limit(1).maybeSingle();
  if (!data) throw new Error(channelId ? "ערוץ הוואטסאפ שנבחר לא קיים או לא פעיל" : "לא הוגדר ערוץ וואטסאפ פעיל (הגדרות ← ערוצים)");
  return data;
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
  const body =
    content.kind === "text"
      ? { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: content.body, preview_url: true } }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: content.name,
            language: { code: content.language },
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
  if (args.content.kind === "text" && !isWindowOpen(conversation.last_inbound_at)) throw new WindowClosedError();

  const body =
    args.content.kind === "text"
      ? args.content.body
      : `[תבנית: ${args.content.name}]${args.content.bodyParams.length ? ` ${args.content.bodyParams.join(" · ")}` : ""}`;
  const base = {
    org_id: args.orgId,
    conversation_id: conversation.id,
    direction: "outbound",
    origin: args.origin,
    type: args.content.kind,
    body,
    payload: args.content,
    sent_by: args.sentBy ?? null,
  };

  let wamid: string;
  try {
    const token = await channelToken(db, channel.id);
    wamid = await callSendApi(channel.external_id, token, contact.phone_digits, args.content);
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
