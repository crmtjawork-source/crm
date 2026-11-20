import "server-only";
import type { CallEvent, CallStatus, TelephonyProvider } from "./types";

// Voicenter CDR webhook (one POST per finished call; JSON or form fields).
// Voicenter documents NO signature, so the secret in the webhook URL is the
// only credential (the route has already checked it) — treat the URL as a
// password and rotate it from Settings if it leaks. Field names are from the
// public docs (checked 2026-11-20) and should be confirmed with a real call.
const str = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? undefined : String(v).trim());
const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : undefined);

export const voicenterProvider: TelephonyProvider = {
  id: "voicenter",
  label: "Voicenter",
  verify: () => true,
  parse(body) {
    const list = Array.isArray(body) ? body : [body];
    const events: CallEvent[] = [];
    for (const item of list) {
      const e = (item ?? {}) as Record<string, unknown>;
      const callRef = str(e.ivruniqueid);
      if (!callRef) continue;
      const direction = /in/i.test(str(e.direction) ?? str(e.type) ?? "") && !/out/i.test(str(e.direction) ?? str(e.type) ?? "") ? "inbound" : "outbound";
      const answered = ["1", "true", "yes"].includes(String(e.isAnswer).toLowerCase()) || /answer/i.test(str(e.status) ?? "") && !/no/i.test(str(e.status) ?? "");
      const raw = (str(e.status) ?? "").toLowerCase();
      const status: CallStatus = answered ? "answered" : raw.includes("busy") ? "busy" : raw.includes("cancel") ? "cancelled" : raw.includes("fail") ? "failed" : "no_answer";
      const epoch = num(e.time);
      const startedAt = epoch ? new Date(epoch * 1000).toISOString() : undefined;
      const durationSeconds = num(e.duration);
      events.push({
        eventId: `${callRef}:call`,
        callRef,
        kind: "call",
        direction,
        from: str(e.caller) ?? str(e.callerPhone),
        to: str(e.target) ?? str(e.did),
        startedAt,
        durationSeconds,
        waitSeconds: num(e.dialtime),
        status,
        recordingUrl: str(e.record),
      });
    }
    return events;
  },
};
