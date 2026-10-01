import "server-only";
import { randomInt } from "node:crypto";
import type { Db } from "./supabaseAdmin";
import { env } from "./env";
import { graphFetch, GraphError } from "./graph";
import { HttpError } from "./auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type SignupMode = "coexistence" | "new_number";

// The code from FB.login is valid for ~30 seconds — exchange it immediately.
export async function exchangeCodeForToken(code: string): Promise<string> {
  const appId = env.metaAppId();
  const secret = env.metaAppSecret();
  if (!appId || !secret) throw new HttpError(503, "META_APP_ID / META_APP_SECRET לא מוגדרים בשרת");

  const url = new URL(`https://graph.facebook.com/${env.graphVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("code", code);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new HttpError(400, `החלפת הקוד מול מטא נכשלה: ${json.error?.message ?? res.status}`);
  }
  return json.access_token as string;
}

type PhoneNumber = { id: string; display_phone_number?: string; verified_name?: string };

export async function resolvePhoneNumber(wabaId: string, token: string, phoneNumberId?: string): Promise<PhoneNumber> {
  const res = await graphFetch<{ data?: PhoneNumber[] }>(`${wabaId}/phone_numbers`, token, {
    query: { fields: "id,display_phone_number,verified_name" },
  });
  const numbers = res.data ?? [];
  if (phoneNumberId) {
    const match = numbers.find((n) => n.id === phoneNumberId);
    if (match) return match;
    throw new HttpError(400, "המספר שנבחר לא נמצא בחשבון הוואטסאפ שחובר");
  }
  // The Business App (coexistence) completion event carries only the WABA id.
  if (numbers.length === 1) return numbers[0];
  if (numbers.length === 0) throw new HttpError(400, "בחשבון הוואטסאפ שחובר אין מספר טלפון");
  throw new HttpError(409, `בחשבון יש ${numbers.length} מספרים — צריך לבחור איזה לחבר`);
}

export async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  await graphFetch(`${wabaId}/subscribed_apps`, token, { method: "POST" });
}

export async function registerPhoneNumber(phoneNumberId: string, token: string, pin: string): Promise<void> {
  await graphFetch(`${phoneNumberId}/register`, token, {
    method: "POST",
    body: { messaging_product: "whatsapp", pin },
  });
}

export function newRegistrationPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Coexistence: ask Meta to push the app's contacts and up to 6 months of chat
// history to our webhook (fields smb_app_state_sync / history). Each may be
// requested once, within 24h of onboarding — so we record success and never
// re-send; a failed request (e.g. webhook not ready) can be retried.
export async function requestCoexistenceSyncs(db: Db, channel: Row, token: string): Promise<string[]> {
  const notes: string[] = [];
  const steps: Array<{ type: "smb_app_state_sync" | "history"; column: string; label: string }> = [
    { type: "smb_app_state_sync", column: "contacts_sync_requested_at", label: "סנכרון אנשי קשר" },
    { type: "history", column: "history_sync_requested_at", label: "סנכרון היסטוריית שיחות" },
  ];
  for (const step of steps) {
    if (channel[step.column]) continue;
    try {
      await graphFetch(`${channel.external_id}/smb_app_data`, token, {
        method: "POST",
        body: { messaging_product: "whatsapp", sync_type: step.type },
      });
      await db.from("channels").update({ [step.column]: new Date().toISOString() }).eq("id", channel.id);
      notes.push(`${step.label} התחיל`);
    } catch (err) {
      notes.push(`${step.label} נכשל: ${err instanceof GraphError ? err.message : String(err)}`);
    }
  }
  return notes;
}

export function within24hOfOnboarding(channel: Row): boolean {
  return !!channel.onboarded_at && Date.now() - new Date(channel.onboarded_at).getTime() < 24 * 60 * 60 * 1000;
}
