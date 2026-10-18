import "server-only";

// Green-API: an unofficial WhatsApp gateway. Each "instance" is one
// WhatsApp account linked as a device (QR scan). Calls look like
//   <apiUrl>/waInstance<idInstance>/<method>/<apiTokenInstance>
// Not endorsed by WhatsApp — numbers that send a lot of automated messages
// to people who never saved them can get banned.

export type GreenApiCreds = { idInstance: string; apiToken: string; apiUrl: string };

export class GreenApiError extends Error {}

const DEFAULT_URL = "https://api.green-api.com";

export function normalizeApiUrl(url: string | null | undefined): string {
  const u = (url ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[\w.-]+$/.test(u) ? u : DEFAULT_URL;
}

async function call<T>(creds: GreenApiCreds, method: string, body?: unknown): Promise<T> {
  const url = `${normalizeApiUrl(creds.apiUrl)}/waInstance${creds.idInstance}/${method}/${creds.apiToken}`;
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    // An unknown or sleeping instance can hang for a minute; don't let one
    // stuck call hold up a whole cron run.
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new GreenApiError("פרטי החיבור ל-Green-API שגויים (מזהה או טוקן)");
    if (res.status === 466) throw new GreenApiError("נגמרה מכסת ההודעות בחשבון Green-API");
    throw new GreenApiError(`Green-API ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GreenApiError("תשובה לא צפויה מ-Green-API");
  }
}

export const chatIdFor = (digits: string) => `${digits}@c.us`;
export const digitsFromChatId = (chatId: string) => (chatId.endsWith("@c.us") ? chatId.slice(0, -5) : null);

export async function getState(creds: GreenApiCreds): Promise<string> {
  const r = await call<{ stateInstance?: string }>(creds, "getStateInstance");
  return r.stateInstance ?? "unknown";
}

// { type: "qrCode", message: <base64 png> } | { type: "alreadyLogged" } | { type: "error", message }
export async function getQr(creds: GreenApiCreds): Promise<{ type: string; message?: string }> {
  return call(creds, "qr");
}

export async function sendText(creds: GreenApiCreds, digits: string, text: string): Promise<string> {
  const r = await call<{ idMessage?: string }>(creds, "sendMessage", { chatId: chatIdFor(digits), message: text });
  if (!r.idMessage) throw new GreenApiError("Green-API לא החזיר מזהה הודעה");
  return r.idMessage;
}

export async function sendFile(creds: GreenApiCreds, digits: string, fileUrl: string, fileName: string, caption?: string): Promise<string> {
  const r = await call<{ idMessage?: string }>(creds, "sendFileByUrl", { chatId: chatIdFor(digits), urlFile: fileUrl, fileName, caption });
  if (!r.idMessage) throw new GreenApiError("Green-API לא החזיר מזהה הודעה");
  return r.idMessage;
}

// Points the instance's webhooks at us: incoming messages, messages the
// agent typed on the phone, our own API sends, delivery statuses, state.
export async function configureWebhooks(creds: GreenApiCreds, webhookUrl: string): Promise<void> {
  await call(creds, "setSettings", {
    webhookUrl,
    incomingWebhook: "yes",
    outgoingWebhook: "yes",
    outgoingMessageWebhook: "yes",
    outgoingAPIMessageWebhook: "yes",
    stateWebhook: "yes",
  });
}

// The linked account's own number ("9725…@c.us"), once authorized.
export async function getWid(creds: GreenApiCreds): Promise<string | null> {
  const r = await call<{ wid?: string }>(creds, "getSettings");
  return r.wid ? r.wid.replace(/@c\.us$/, "") : null;
}

export async function logout(creds: GreenApiCreds): Promise<void> {
  await call(creds, "logout");
}
