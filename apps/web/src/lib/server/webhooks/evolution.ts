import "server-only";
import type { Db } from "../supabaseAdmin";
import { cancelWaitingRunsOnReply } from "../automations";
import { preview } from "../whatsapp";
import { storeMessageMedia } from "../waMedia";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const STATUS: Record<string, string> = { SERVER_ACK: "sent", DELIVERY_ACK: "delivered", READ: "read", PLAYED: "read", ERROR: "failed" };
const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

// How far back the history WhatsApp sends when a device is linked is kept.
const HISTORY_DAYS = 30;
const MAX_LIVE_MEDIA_BYTES = 25 * 1024 * 1024;

const WRAPPERS = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage", "editedMessage"];

// The message content inside WhatsApp's wrappers (disappearing / view-once…).
function unwrap(message: Row | undefined): Row {
  let m: Row = message ?? {};
  for (let i = 0; i < 4; i++) {
    const key = WRAPPERS.find((w) => m[w]?.message);
    if (!key) break;
    m = m[key].message;
  }
  return m;
}

type Described = { type: string; body: string; mime?: string; fileName?: string; size?: number; media: boolean };

function describe(raw: Row | undefined): Described | null {
  const m = unwrap(raw);
  if (m.conversation) return { type: "text", body: m.conversation, media: false };
  if (m.extendedTextMessage?.text) return { type: "text", body: m.extendedTextMessage.text, media: false };
  const media: [string, string][] = [
    ["imageMessage", "תמונה"],
    ["videoMessage", "סרטון"],
    ["audioMessage", "הודעה קולית"],
    ["documentMessage", "מסמך"],
    ["stickerMessage", "סטיקר"],
  ];
  for (const [key, label] of media) {
    const x = m[key];
    if (!x) continue;
    const type = key === "audioMessage" && x.ptt ? "voice" : key.replace(/Message$/, "");
    const caption = x.caption ? ` ${x.caption}` : "";
    const fileName = key === "documentMessage" ? x.fileName ?? x.title : undefined;
    return { type, body: `[${label}]${key === "documentMessage" && fileName ? ` ${fileName}` : ""}${caption}`, mime: x.mimetype, fileName, size: Number(x.fileLength) || undefined, media: true };
  }
  if (m.locationMessage) return { type: "location", body: `[מיקום] ${m.locationMessage.name ?? m.locationMessage.address ?? ""}`.trim(), media: false };
  if (m.liveLocationMessage) return { type: "location", body: "[מיקום חי]", media: false };
  if (m.contactMessage) return { type: "contact", body: `[איש קשר] ${m.contactMessage.displayName ?? ""}`.trim(), media: false };
  if (m.contactsArrayMessage) return { type: "contact", body: "[אנשי קשר]", media: false };
  if (m.pollCreationMessage || m.pollCreationMessageV3) return { type: "poll", body: `[סקר] ${(m.pollCreationMessage ?? m.pollCreationMessageV3).name ?? ""}`.trim(), media: false };
  if (m.buttonsResponseMessage?.selectedDisplayText) return { type: "text", body: m.buttonsResponseMessage.selectedDisplayText, media: false };
  if (m.listResponseMessage?.title) return { type: "text", body: m.listResponseMessage.title, media: false };
  // Reactions, deletes, key exchanges and the like aren't chat bubbles.
  return null;
}

// The chat a message belongs to: a 1:1 chat is keyed by the phone number, a
// group by its id. Broadcast lists, status updates and channels are skipped.
type Chat = { thread: string; jid: string; isGroup: boolean; lid?: string };

function chatOf(key: Row, lidMap?: Map<string, string>): Chat | null {
  const jid: string = key?.remoteJid ?? "";
  // WhatsApp's newer anonymous ids ("@lid"): the real number when we know it
  // (given with the message, or learned earlier); otherwise the chat is kept
  // under the anonymous id until we learn the number.
  if (jid.endsWith("@lid")) {
    const lid = jid.split("@")[0];
    const phone = key.remoteJidAlt?.endsWith("@s.whatsapp.net") ? key.remoteJidAlt.split("@")[0].split(":")[0] : lidMap?.get(lid);
    if (!phone) return { thread: jid, jid, isGroup: false, lid };
    const c = chatOf({ remoteJid: `${phone}@s.whatsapp.net` })!;
    return { ...c, lid };
  }
  if (jid.endsWith("@g.us")) return { thread: jid, jid, isGroup: true };
  if (jid.endsWith("@s.whatsapp.net")) return { thread: jid.split("@")[0].split(":")[0], jid: `${jid.split("@")[0].split(":")[0]}@s.whatsapp.net`, isGroup: false };
  return null;
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const tsOf = (m: Row) => (m.messageTimestamp ? new Date(Number(m.messageTimestamp?.low ?? m.messageTimestamp) * 1000) : new Date());

// Stores a batch of messages (live ones, or a history chunk): finds or creates
// each chat, links 1:1 chats to leads by phone, and writes the messages.
async function ingestMessages(db: Db, channel: Row, msgs: Row[], history: boolean): Promise<void> {
  const cutoff = Date.now() - HISTORY_DAYS * 86400000;
  type Item = { m: Row; chat: Chat; d: Described; at: Date; fromMe: boolean };
  // Anonymous chat ids we already know the number of.
  const lidsInBatch = [...new Set(msgs.map((m) => String(m?.key?.remoteJid ?? "")).filter((j) => j.endsWith("@lid")).map((j) => j.split("@")[0]))];
  const lidMap = new Map<string, string>();
  for (const part of chunk(lidsInBatch, 200)) {
    const { data } = await db.from("wa_lid_map").select("lid, phone").eq("channel_id", channel.id).in("lid", part);
    for (const r of data ?? []) lidMap.set(r.lid, r.phone);
  }
  // Messages we sent from the CRM are in our database under the phone-number
  // chat: if WhatsApp reports the same message id under an anonymous chat id,
  // that tells us whose number it is.
  const unresolved = msgs.filter((m) => {
    const jid = String(m?.key?.remoteJid ?? "");
    return jid.endsWith("@lid") && !m.key.remoteJidAlt && !lidMap.has(jid.split("@")[0]) && m.key.id;
  });
  for (const part of chunk(unresolved, 150)) {
    const ids = part.map((m) => m.key.id as string);
    const { data } = await db.from("messages").select("external_id, conversations!inner(external_thread_id, channel_id)").in("external_id", ids).eq("conversations.channel_id", channel.id);
    const phoneOf = new Map<string, string>();
    for (const r of (data ?? []) as unknown as { external_id: string; conversations: { external_thread_id: string } | { external_thread_id: string }[] }[]) {
      const conv = Array.isArray(r.conversations) ? r.conversations[0] : r.conversations;
      if (conv && /^\d+$/.test(conv.external_thread_id)) phoneOf.set(r.external_id, conv.external_thread_id);
    }
    for (const m of part) {
      const phone = phoneOf.get(m.key.id);
      if (phone) lidMap.set(String(m.key.remoteJid).split("@")[0], phone);
    }
  }
  const items: Item[] = [];
  for (const m of msgs) {
    if (!m?.key?.id) continue;
    const chat = chatOf(m.key, lidMap);
    if (!chat) continue;
    const d = describe(m.message);
    if (!d) continue;
    const at = tsOf(m);
    if (history && at.getTime() < cutoff) continue;
    items.push({ m, chat, d, at, fromMe: Boolean(m.key.fromMe) });
  }
  if (!items.length) return;

  // Leads by phone (1:1 chats only).
  const digits = [...new Set(items.filter((i) => !i.chat.isGroup && !i.chat.thread.includes("@")).map((i) => i.chat.thread))];
  const contactOf = new Map<string, string>();
  for (const part of chunk(digits, 200)) {
    const { data } = await db.from("contacts").select("id, phone_digits").eq("org_id", channel.org_id).in("phone_digits", part).order("created_at");
    for (const c of data ?? []) if (!contactOf.has(c.phone_digits)) contactOf.set(c.phone_digits, c.id);
  }

  // Names we already know for these chats.
  const jids = [...new Set(items.map((i) => i.chat.jid))];
  const nameOf = new Map<string, string>();
  for (const part of chunk(jids, 200)) {
    const { data } = await db.from("wa_chat_names").select("jid, name").eq("channel_id", channel.id).in("jid", part);
    for (const n of data ?? []) nameOf.set(n.jid, n.name);
  }
  for (const i of items) if (!i.chat.isGroup && !i.fromMe && i.m.pushName && !/^[+\d\s()-]+$/.test(i.m.pushName) && !nameOf.has(i.chat.jid)) nameOf.set(i.chat.jid, i.m.pushName);

  // Chats: existing ones, then the missing ones created in bulk.
  const threads = [...new Set(items.map((i) => i.chat.thread))];
  const convOf = new Map<string, Row>();
  const load = async () => {
    for (const part of chunk(threads, 200)) {
      const { data } = await db.from("conversations").select("*").eq("channel_id", channel.id).in("external_thread_id", part);
      for (const c of data ?? []) convOf.set(c.external_thread_id, c);
    }
  };
  await load();
  const missing = threads.filter((t) => !convOf.has(t));
  if (missing.length) {
    const info = new Map(items.map((i) => [i.chat.thread, i.chat]));
    for (const part of chunk(missing, 200)) {
      await db.from("conversations").upsert(
        part.map((t) => {
          const c = info.get(t)!;
          return { org_id: channel.org_id, channel_id: channel.id, contact_id: c.isGroup ? null : contactOf.get(t) ?? null, external_thread_id: t, wa_jid: c.jid, is_group: c.isGroup, chat_name: nameOf.get(c.jid) ?? null };
        }),
        { onConflict: "channel_id,external_thread_id", ignoreDuplicates: true }
      );
    }
    await load();
  }
  // A chat that gained a lead / name / jid since it was created.
  for (const t of threads) {
    const conv = convOf.get(t);
    const chat = items.find((i) => i.chat.thread === t)!.chat;
    if (!conv) continue;
    const patch: Row = {};
    if (!conv.contact_id && !chat.isGroup && contactOf.get(t)) patch.contact_id = contactOf.get(t);
    if (!conv.wa_jid) patch.wa_jid = chat.jid;
    if (!conv.chat_name && nameOf.get(chat.jid)) patch.chat_name = nameOf.get(chat.jid);
    if (Object.keys(patch).length) await db.from("conversations").update(patch).eq("id", conv.id);
  }

  // Learned the number behind an anonymous id: remember it, and fold a chat
  // that was kept under the anonymous id into the phone-number chat.
  const learned = new Map<string, string>();
  for (const i of items) if (i.chat.lid && !i.chat.thread.includes("@")) learned.set(i.chat.lid, i.chat.thread);
  if (learned.size) {
    await db.from("wa_lid_map").upsert([...learned].map(([lid, phone]) => ({ channel_id: channel.id, lid, phone })), { onConflict: "channel_id,lid", ignoreDuplicates: true });
    for (const [lid, phone] of learned) {
      const { data: old } = await db.from("conversations").select("id").eq("channel_id", channel.id).eq("external_thread_id", `${lid}@lid`).maybeSingle();
      const target = convOf.get(phone);
      if (old && target) await db.rpc("merge_wa_conversations", { p_from: old.id, p_to: target.id });
    }
  }

  // Messages, in bulk; only genuinely new ones come back.
  const rows = items.map((i) => ({
    org_id: channel.org_id,
    conversation_id: convOf.get(i.chat.thread)!.id,
    direction: i.fromMe ? "outbound" : "inbound",
    origin: i.fromMe ? "phone_app" : null,
    type: i.d.type,
    body: i.d.body,
    payload: i.m,
    external_id: i.m.key.id,
    status: i.fromMe ? "sent" : "received",
    created_at: i.at.toISOString(),
    sender_jid: i.chat.isGroup ? i.m.key.participant ?? i.m.participant ?? null : null,
    sender_name: i.chat.isGroup && !i.fromMe ? i.m.pushName ?? null : null,
    media_mime: i.d.media ? i.d.mime ?? null : null,
    media_name: i.d.fileName ?? null,
    media_size: i.d.size ?? null,
  }));
  const inserted: Row[] = [];
  for (const part of chunk(rows, 300)) {
    const { data } = await db.from("messages").upsert(part, { onConflict: "conversation_id,external_id", ignoreDuplicates: true }).select("id, external_id, conversation_id, type, payload, org_id, media_mime, media_name, media_path");
    inserted.push(...(data ?? []));
  }
  if (!inserted.length) return;
  const insertedIds = new Set(inserted.map((r) => r.external_id));
  const fresh = items.filter((i) => insertedIds.has(i.m.key.id));

  // Chat summaries: last message, and (live only) unread counts.
  const latest = new Map<string, Item>();
  for (const i of fresh) {
    const cur = latest.get(i.chat.thread);
    if (!cur || i.at > cur.at) latest.set(i.chat.thread, i);
  }
  for (const [t, i] of latest) {
    const conv = convOf.get(t)!;
    if (!conv.last_message_at || i.at.getTime() >= new Date(conv.last_message_at).getTime())
      await db.from("conversations").update({ last_message_at: i.at.toISOString(), last_message_preview: preview(i.d.body), last_direction: i.fromMe ? "outbound" : "inbound" }).eq("id", conv.id);
  }
  if (!history) {
    for (const i of fresh) {
      if (i.fromMe) continue;
      const conv = convOf.get(i.chat.thread)!;
      await db.rpc("bump_conversation_inbound", { conv_id: conv.id, at: i.at.toISOString(), preview: preview(i.d.body) });
      if (conv.contact_id ?? contactOf.get(i.chat.thread)) await cancelWaitingRunsOnReply(db, channel.org_id, (conv.contact_id ?? contactOf.get(i.chat.thread))!);
    }
    // Live media is fetched right away (WhatsApp keeps the file only a while); history media on demand.
    for (const i of fresh) {
      if (!i.d.media || (i.d.size ?? 0) > MAX_LIVE_MEDIA_BYTES) continue;
      const row = inserted.find((r) => r.external_id === i.m.key.id);
      if (row) await storeMessageMedia(db, channel, row);
    }
  }
}

// "Delete for everyone": this number's copy of the message becomes a tombstone.
async function markDeleted(db: Db, channel: Row, externalId: string) {
  const { data: found } = await db.from("messages").select("id, conversations!inner(channel_id)").eq("external_id", externalId).eq("conversations.channel_id", channel.id);
  for (const msg of found ?? []) await db.from("messages").update({ type: "deleted", body: "[הודעה נמחקה]", media_path: null }).eq("id", msg.id);
}

// Every chat WhatsApp lists gets a conversation — even one with no message in
// the last 30 days — so the list matches the phone. Such chats show empty until
// something new arrives.
async function ensureChats(db: Db, channel: Row, jids: string[]): Promise<void> {
  const lids = jids.filter((j) => j.endsWith("@lid")).map((j) => j.split("@")[0]);
  const lidMap = new Map<string, string>();
  for (const part of chunk(lids, 200)) {
    const { data } = await db.from("wa_lid_map").select("lid, phone").eq("channel_id", channel.id).in("lid", part);
    for (const r of data ?? []) lidMap.set(r.lid, r.phone);
  }
  const chats = new Map<string, Chat>();
  for (const jid of jids) {
    const chat = chatOf({ remoteJid: jid }, lidMap);
    if (chat) chats.set(chat.thread, chat);
  }
  const threads = [...chats.keys()];
  if (!threads.length) return;
  const have = new Set<string>();
  for (const part of chunk(threads, 200)) {
    const { data } = await db.from("conversations").select("external_thread_id").eq("channel_id", channel.id).in("external_thread_id", part);
    for (const c of data ?? []) have.add(c.external_thread_id);
  }
  const missing = threads.filter((t) => !have.has(t));
  if (!missing.length) return;

  const contactOf = new Map<string, string>();
  const digits = missing.filter((t) => !chats.get(t)!.isGroup && !t.includes("@"));
  for (const part of chunk(digits, 200)) {
    const { data } = await db.from("contacts").select("id, phone_digits").eq("org_id", channel.org_id).in("phone_digits", part).order("created_at");
    for (const c of data ?? []) if (!contactOf.has(c.phone_digits)) contactOf.set(c.phone_digits, c.id);
  }
  const nameOf = new Map<string, string>();
  for (const part of chunk(missing.map((t) => chats.get(t)!.jid), 200)) {
    const { data } = await db.from("wa_chat_names").select("jid, name").eq("channel_id", channel.id).in("jid", part);
    for (const n of data ?? []) nameOf.set(n.jid, n.name);
  }
  for (const part of chunk(missing, 300)) {
    await db.from("conversations").upsert(
      part.map((t) => {
        const c = chats.get(t)!;
        return { org_id: channel.org_id, channel_id: channel.id, contact_id: c.isGroup ? null : contactOf.get(t) ?? null, external_thread_id: t, wa_jid: c.jid, is_group: c.isGroup, chat_name: nameOf.get(c.jid) ?? null };
      }),
      { onConflict: "channel_id,external_thread_id", ignoreDuplicates: true }
    );
  }
}

function namesFrom(list: unknown, pick: (x: Row) => { jid?: string; name?: string }): { jid: string; name: string }[] {
  const out: { jid: string; name: string }[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const { jid, name } = pick(x ?? {});
    // A bare number isn't a name (WhatsApp sometimes reports the id itself).
    if (jid && name && !/^[+\d\s()-]+$/.test(name) && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@g.us") || jid.endsWith("@lid"))) out.push({ jid: jid.replace(/:\d+@/, "@"), name });
  }
  return out;
}

// Everything a linked number reports: messages (all chats, groups included),
// the history sent at linking, and the names that go with them.
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
      // Only this number's copy of the message (another linked number may hold one too).
      const { data: found } = await db.from("messages").select("id, status, conversations!inner(channel_id)").eq("external_id", id).eq("conversations.channel_id", channel.id);
      for (const msg of found ?? []) {
        if ((RANK[msg.status] ?? -1) >= RANK[next] && next !== "failed") continue;
        await db.from("messages").update({ status: next }).eq("id", msg.id);
      }
    }
    return null;
  }

  if (event === "messages.delete") {
    for (const k of Array.isArray(data) ? data : [data]) {
      const id = k?.id ?? k?.key?.id;
      if (id) await markDeleted(db, channel, id);
    }
    return null;
  }

  // Names: contacts, chats, groups.
  if (event === "contacts.upsert" || event === "contacts.update" || event === "contacts.set") {
    const list = namesFrom(Array.isArray(data) ? data : data.contacts ?? [], (c) => ({ jid: c.remoteJid ?? c.id, name: c.name ?? c.pushName ?? c.notify }));
    for (const part of chunk(list, 500)) await db.rpc("apply_wa_names", { p_channel: channel.id, p_names: part });
    return null;
  }
  if (event === "chats.upsert" || event === "chats.set" || event === "chats.update") {
    const raw: Row[] = Array.isArray(data) ? data : data.chats ?? [];
    if (event !== "chats.update") await ensureChats(db, channel, raw.map((c) => c?.remoteJid ?? c?.id).filter((j): j is string => typeof j === "string"));
    const list = namesFrom(Array.isArray(data) ? data : data.chats ?? [], (c) => ({ jid: c.remoteJid ?? c.id, name: c.name ?? c.subject }));
    for (const part of chunk(list, 500)) await db.rpc("apply_wa_names", { p_channel: channel.id, p_names: part });
    return null;
  }
  if (event === "groups.upsert" || event === "group.update") {
    const list = namesFrom(Array.isArray(data) ? data : [data], (g) => ({ jid: g.id ?? g.groupJid ?? g.remoteJid, name: g.subject }));
    await db.rpc("apply_wa_names", { p_channel: channel.id, p_names: list });
    return null;
  }

  // History: the chunks WhatsApp sends when the device is linked.
  if (event === "messages.set" || event === "messaging.history.set") {
    const msgs: Row[] = Array.isArray(data) ? data : data.messages ?? [];
    await ingestMessages(db, channel, msgs, true);
    // The history set may carry chats / contacts with names too.
    const names = [
      ...namesFrom(data.chats, (c) => ({ jid: c.remoteJid ?? c.id, name: c.name ?? c.subject })),
      ...namesFrom(data.contacts, (c) => ({ jid: c.remoteJid ?? c.id, name: c.name ?? c.pushName ?? c.notify })),
    ];
    for (const part of chunk(names, 500)) await db.rpc("apply_wa_names", { p_channel: channel.id, p_names: part });
    return `היסטוריה: ${msgs.length} הודעות בחבילה`;
  }

  if (event !== "messages.upsert") return null;
  const list: Row[] = Array.isArray(data) ? data : [data];
  // A message revoked ("delete for everyone") arrives as a protocol message.
  for (const m of list) {
    const proto = unwrap(m.message).protocolMessage;
    if (proto?.type === 0 || proto?.type === "REVOKE") {
      const id = proto.key?.id;
      if (id) await markDeleted(db, channel, id);
    }
  }
  await ingestMessages(db, channel, list, false);
  return null;
}

// Brings our chat list in line with the gateway's stored one: every chat exists,
// names are filled in, and unread counts match what WhatsApp shows.
export async function syncChatList(
  db: Db,
  channel: Row,
  chats: Array<{ remoteJid: string; name?: string; pushName?: string; unreadMessages?: number }>,
  contacts: Array<{ remoteJid?: string; id?: string; pushName?: string; profileName?: string }>
): Promise<{ chats: number; unread: number }> {
  const names = [
    ...namesFrom(chats, (c) => ({ jid: c.remoteJid, name: c.name ?? c.pushName })),
    ...namesFrom(contacts, (c) => ({ jid: c.remoteJid ?? c.id, name: c.pushName ?? c.profileName })),
  ];
  await ensureChats(db, channel, chats.map((c) => c.remoteJid).filter(Boolean));
  for (const part of chunk(names, 500)) await db.rpc("apply_wa_names", { p_channel: channel.id, p_names: part });
  let unread = 0;
  const withUnread = chats.filter((c) => (c.unreadMessages ?? 0) > 0);
  for (const c of withUnread) {
    const chat = chatOf({ remoteJid: c.remoteJid });
    if (!chat) continue;
    await db.from("conversations").update({ unread_count: c.unreadMessages }).eq("channel_id", channel.id).eq("external_thread_id", chat.thread);
    unread++;
  }
  return { chats: chats.length, unread };
}
