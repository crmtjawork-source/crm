import "server-only";
import { env } from "./env";

// Evolution API: self-hosted WhatsApp gateway (one server, an "instance" per
// linked WhatsApp). Unofficial like any linked-device gateway — heavy
// automated sending to people who never saved the number risks a ban.

export class EvolutionError extends Error {}

export function evolutionConfigured(): boolean {
  return !!(env.evolutionUrl() && env.evolutionApiKey());
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = env.evolutionUrl()!.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: env.evolutionApiKey()!, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new EvolutionError(`Evolution ${res.status}: ${text.slice(0, 200)}`);
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new EvolutionError("תשובה לא צפויה מ-Evolution");
  }
}

// Everything needed to mirror a WhatsApp like WhatsApp Web: messages (live and
// the history WhatsApp sends when a device is linked), names, groups, deletes.
const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_SET",
  "MESSAGES_DELETE",
  "CONNECTION_UPDATE",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "CONTACTS_SET",
  "CHATS_UPSERT",
  "CHATS_SET",
  "GROUPS_UPSERT",
  "GROUP_UPDATE",
];

// Instance behaviour: groups included, and ask WhatsApp for the history when
// the device is (re)linked — we keep the last 30 days of it.
export async function applySettings(name: string): Promise<void> {
  await call("POST", `/settings/set/${encodeURIComponent(name)}`, {
    rejectCall: false,
    msgCall: "",
    groupsIgnore: false,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: true,
  });
}

export async function createInstance(name: string, webhookUrl: string): Promise<void> {
  await call("POST", "/instance/create", {
    instanceName: name,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    groupsIgnore: false,
    readMessages: false,
    syncFullHistory: true,
    webhook: { url: webhookUrl, byEvents: false, base64: false, events: WEBHOOK_EVENTS },
  });
}

export async function setWebhook(name: string, webhookUrl: string): Promise<void> {
  await call("POST", `/webhook/set/${encodeURIComponent(name)}`, {
    webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: WEBHOOK_EVENTS },
  });
}

// "open" = linked; "connecting" / "close" = waiting for a QR scan.
export async function getState(name: string): Promise<string> {
  const r = await call<{ instance?: { state?: string } }>("GET", `/instance/connectionState/${encodeURIComponent(name)}`);
  return r.instance?.state ?? "unknown";
}

// base64 PNG data URL of the QR to scan.
export async function getQr(name: string): Promise<string | null> {
  const r = await call<{ base64?: string }>("GET", `/instance/connect/${encodeURIComponent(name)}`);
  return r.base64 ?? null;
}

export async function ownNumber(name: string): Promise<string | null> {
  const list = await call<Array<{ name?: string; ownerJid?: string; instance?: { instanceName?: string; owner?: string } }>>(
    "GET",
    `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`
  );
  const row = Array.isArray(list) ? list[0] : null;
  const jid = row?.ownerJid ?? row?.instance?.owner ?? "";
  return jid ? jid.split("@")[0] : null;
}

export async function sendText(name: string, digits: string, text: string): Promise<string> {
  const r = await call<{ key?: { id?: string } }>("POST", `/message/sendText/${encodeURIComponent(name)}`, { number: digits, text });
  if (!r.key?.id) throw new EvolutionError("Evolution לא החזיר מזהה הודעה");
  return r.key.id;
}

// mediatype: image | video | document; voice notes go through sendVoice.
// gifPlayback (video only) needs our server's one-line patch (see /opt/evolution/patches).
export async function sendMedia(
  name: string,
  digits: string,
  url: string,
  mediatype: "image" | "video" | "document",
  caption?: string,
  fileName?: string,
  gifPlayback = false
): Promise<string> {
  const r = await call<{ key?: { id?: string } }>("POST", `/message/sendMedia/${encodeURIComponent(name)}`, {
    number: digits,
    mediatype,
    media: url,
    caption,
    fileName,
    ...(gifPlayback ? { gifPlayback: true } : {}),
  });
  if (!r.key?.id) throw new EvolutionError("Evolution לא החזיר מזהה הודעה");
  return r.key.id;
}

export async function sendVoice(name: string, digits: string, url: string): Promise<string> {
  const r = await call<{ key?: { id?: string } }>("POST", `/message/sendWhatsAppAudio/${encodeURIComponent(name)}`, { number: digits, audio: url });
  if (!r.key?.id) throw new EvolutionError("Evolution לא החזיר מזהה הודעה");
  return r.key.id;
}

export async function logout(name: string): Promise<void> {
  await call("DELETE", `/instance/logout/${encodeURIComponent(name)}`);
}

// Downloads and decrypts a media message from WhatsApp. We pass the message
// itself (from the webhook), since the server keeps no messages of its own.
export async function getMediaBase64(name: string, message: unknown): Promise<{ base64: string; mimetype?: string; fileName?: string }> {
  const r = await call<{ base64?: string; mimetype?: string; fileName?: string; mediaType?: string }>("POST", `/chat/getBase64FromMediaMessage/${encodeURIComponent(name)}`, {
    message,
    convertToMp4: false,
  });
  if (!r.base64) throw new EvolutionError("המדיה לא זמינה");
  return { base64: r.base64.replace(/^data:[^;]+;base64,/, ""), mimetype: r.mimetype, fileName: r.fileName };
}

export type EvoChat = { remoteJid: string; name?: string; pushName?: string; unreadMessages?: number; updatedAt?: string };

// The chat list the gateway keeps for the number (needs chat storage enabled
// on the server): per-chat unread counts and names, as WhatsApp Web shows.
export async function findChats(name: string): Promise<EvoChat[]> {
  const r = await call<EvoChat[] | { chats?: EvoChat[] }>("POST", `/chat/findChats/${encodeURIComponent(name)}`, { where: {} });
  return Array.isArray(r) ? r : r.chats ?? [];
}

export async function findContacts(name: string): Promise<Array<{ remoteJid?: string; id?: string; pushName?: string; profileName?: string }>> {
  const r = await call<Array<{ remoteJid?: string; id?: string; pushName?: string; profileName?: string }>>("POST", `/chat/findContacts/${encodeURIComponent(name)}`, { where: {} });
  return Array.isArray(r) ? r : [];
}

// Marks messages as read on the phone (the blue ticks / cleared badge), like opening the chat in WhatsApp Web.
export async function markRead(name: string, keys: Array<{ remoteJid: string; fromMe: boolean; id: string }>): Promise<void> {
  if (!keys.length) return;
  await call("POST", `/chat/markMessageAsRead/${encodeURIComponent(name)}`, { readMessages: keys });
}
