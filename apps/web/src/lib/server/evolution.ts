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

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

export async function createInstance(name: string, webhookUrl: string): Promise<void> {
  await call("POST", "/instance/create", {
    instanceName: name,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
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
export async function sendMedia(name: string, digits: string, url: string, mediatype: "image" | "video" | "document", caption?: string, fileName?: string): Promise<string> {
  const r = await call<{ key?: { id?: string } }>("POST", `/message/sendMedia/${encodeURIComponent(name)}`, { number: digits, mediatype, media: url, caption, fileName });
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
