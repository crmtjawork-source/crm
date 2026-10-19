import "server-only";
import type { Db } from "../supabaseAdmin";
import { findOrCreateConversation, preview } from "../whatsapp";
import { cancelWaitingRunsOnReply } from "../automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const STATUS: Record<string, string> = { SERVER_ACK: "sent", DELIVERY_ACK: "delivered", READ: "read", PLAYED: "read", ERROR: "failed" };
const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

function describe(m: Row = {}): { type: string; body: string } {
  if (m.conversation) return { type: "text", body: m.conversation };
  if (m.extendedTextMessage?.text) return { type: "text", body: m.extendedTextMessage.text };
  const media: [string, string][] = [
    ["imageMessage", "תמונה"],
    ["videoMessage", "סרטון"],
    ["audioMessage", "הודעה קולית"],
    ["documentMessage", "מסמך"],
    ["stickerMessage", "סטיקר"],
    ["locationMessage", "מיקום"],
    ["contactMessage", "איש קשר"],
  ];
  for (const [key, label] of media) {
    if (m[key]) return { type: key.replace(/Message$/, ""), body: m[key].caption ? `[${label}] ${m[key].caption}` : `[${label}]` };
  }
  if (m.reactionMessage) return { type: "reaction", body: `הגיב/ה ${m.reactionMessage.text ?? ""}`.trim() };
  return { type: "unknown", body: "[הודעה]" };
}

// Only chats with existing leads are stored — the agent's WhatsApp also
// holds personal conversations that don't belong in the CRM.
export async function handleEvolutionEvent(db: Db, channel: Row, p: Row): Promise<string | null> {
  const event = String(p.event ?? "").toLowerCase().replace(/_/g, ".");
  const data = p.data ?? {};

  if (event === "connection.update") {
    const state = data.state === "open" ? "authorized" : data.state ? "notAuthorized" : null;
    await db.from("channels").update({ status: state, status_checked_at: new Date().toISOString() }).eq("id", channel.id);
    return null;
  }

  if (event === "messages.update") {
    for (const u of Array.isArray(data) ? data : [data]) {
      const next = STATUS[String(u.status ?? "").toUpperCase()];
      const id = u.keyId ?? u.key?.id;
      if (!next || !id) continue;
      const { data: msg } = await db.from("messages").select("id, status").eq("org_id", channel.org_id).eq("external_id", id).maybeSingle();
      if (!msg || ((RANK[msg.status] ?? -1) >= RANK[next] && next !== "failed")) continue;
      await db.from("messages").update({ status: next }).eq("id", msg.id);
    }
    return null;
  }

  if (event !== "messages.upsert") return null;
  for (const m of Array.isArray(data) ? data : [data]) {
    const jid: string = m.key?.remoteJid ?? "";
    if (!jid.endsWith("@s.whatsapp.net")) continue; // groups, broadcasts, status
    const digits = jid.split("@")[0];
    const { data: contact } = await db.from("contacts").select("id").eq("org_id", channel.org_id).eq("phone_digits", digits).order("created_at").limit(1).maybeSingle();
    if (!contact) continue;
    const inbound = !m.key?.fromMe;
    const at = m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000).toISOString() : new Date().toISOString();
    const conversation = await findOrCreateConversation(db, { orgId: channel.org_id, channelId: channel.id, contactId: contact.id, waId: digits });
    const { type, body } = describe(m.message);
    // Our own API sends come back here too; they're already stored (same id).
    const { data: inserted } = await db
      .from("messages")
      .upsert(
        {
          org_id: channel.org_id,
          conversation_id: conversation.id,
          direction: inbound ? "inbound" : "outbound",
          origin: inbound ? null : "phone_app",
          type,
          body,
          payload: m,
          external_id: m.key?.id,
          status: inbound ? "received" : "sent",
          created_at: at,
        },
        { onConflict: "org_id,external_id", ignoreDuplicates: true }
      )
      .select("id");
    if (!inserted?.length) continue;
    if (inbound) {
      await db.rpc("bump_conversation_inbound", { conv_id: conversation.id, at, preview: preview(body) });
      await cancelWaitingRunsOnReply(db, channel.org_id, contact.id);
    } else {
      await db.from("conversations").update({ last_message_at: at, last_message_preview: preview(body) }).eq("id", conversation.id);
    }
  }
  return null;
}
