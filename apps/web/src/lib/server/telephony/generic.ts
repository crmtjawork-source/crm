import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CallEvent, CallStatus, TelephonyProvider } from "./types";

// "Generic" adapter: any phone system (or a Make/Zapier step, or a small
// script next to the PBX) that can POST JSON to the webhook URL.
//
// Signature: header `X-CRM-Signature: sha256=<hex>` = HMAC-SHA256 of the raw
// body with the connection's signing secret. With the optional header
// `X-CRM-Timestamp` (unix seconds) the signed text is `${timestamp}.${body}`
// and requests older than 5 minutes are rejected (replay protection).
//
// Body: one event, an array, or { events: [...] }. Event fields:
//   event_id?, type: "call" | "recording", call_id, direction, from, to,
//   started_at, ended_at, duration_seconds, wait_seconds, status,
//   agent_email, agent_name, recording_url, recording_duration_seconds

const STATUSES: CallStatus[] = ["answered", "no_answer", "busy", "cancelled", "failed"];
const REPLAY_WINDOW_SECONDS = 300;

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export function hmacHex(secret: string, text: string): string {
  return createHmac("sha256", secret).update(text).digest("hex");
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};
const iso = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

export const genericProvider: TelephonyProvider = {
  id: "generic",
  label: "כללי (JSON חתום)",

  verify({ rawBody, headers }, { signingSecret }) {
    const header = headers.get("x-crm-signature")?.replace(/^sha256=/, "").trim();
    if (!header || !signingSecret) return false;
    const timestamp = headers.get("x-crm-timestamp");
    if (timestamp) {
      const age = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) return false;
      return safeEqualHex(header, hmacHex(signingSecret, `${timestamp}.${rawBody}`));
    }
    return safeEqualHex(header, hmacHex(signingSecret, rawBody));
  },

  parse(body) {
    const list: unknown[] = Array.isArray(body) ? body : Array.isArray((body as { events?: unknown })?.events) ? (body as { events: unknown[] }).events : [body];
    const events: CallEvent[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      const callRef = str(e.call_id);
      if (!callRef) continue;
      const kind = e.type === "recording" ? "recording" : "call";
      const status = str(e.status);
      const direction = e.direction === "inbound" || e.direction === "outbound" ? e.direction : undefined;
      events.push({
        eventId: str(e.event_id) ?? `${callRef}:${kind}`,
        callRef,
        kind,
        direction,
        from: str(e.from),
        to: str(e.to),
        startedAt: iso(e.started_at),
        endedAt: iso(e.ended_at),
        durationSeconds: num(e.duration_seconds),
        waitSeconds: num(e.wait_seconds),
        status: STATUSES.includes(status as CallStatus) ? (status as CallStatus) : undefined,
        agentEmail: str(e.agent_email)?.toLowerCase(),
        agentName: str(e.agent_name),
        recordingUrl: str(e.recording_url),
        recordingDurationSeconds: num(e.recording_duration_seconds),
      });
    }
    return events;
  },
};
