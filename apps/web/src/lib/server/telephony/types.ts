// The provider-agnostic shape of what a phone system tells us. Each provider
// adapter turns its own webhook payload into these; the rest of the CRM only
// knows this.

export type CallDirection = "inbound" | "outbound";
export type CallStatus = "answered" | "no_answer" | "busy" | "cancelled" | "failed";

export type CallEvent = {
  // Idempotency key: the same event delivered twice carries the same id.
  eventId: string;
  // The provider's id of the call (stored as calls.external_ref).
  callRef: string;
  // A call's own lifecycle, or a recording that became available later.
  kind: "call" | "recording";
  direction?: CallDirection;
  from?: string;
  to?: string;
  startedAt?: string; // ISO
  endedAt?: string; // ISO
  durationSeconds?: number; // talk time
  waitSeconds?: number;
  status?: CallStatus;
  agentEmail?: string;
  agentName?: string;
  recordingUrl?: string;
  recordingDurationSeconds?: number;
};

export type ProviderCredentials = { signingSecret: string; apiKey: string | null };

export type RawRequest = { rawBody: string; headers: Headers; url: string };

export interface TelephonyProvider {
  id: string;
  label: string;
  // True when the request really comes from the provider. Must be constant-time
  // and must fail closed.
  verify(req: RawRequest, creds: ProviderCredentials): boolean;
  // Turns the (already verified) body into events. May return several.
  parse(body: unknown, req: RawRequest): CallEvent[];
  // Optional: start a call through the provider's API (agent's phone rings
  // first, then the lead's). Absent = the app falls back to a tel: link.
  clickToCall?(args: { creds: ProviderCredentials; agentPhone: string; leadPhone: string; callRef: string }): Promise<{ callRef: string }>;
}
