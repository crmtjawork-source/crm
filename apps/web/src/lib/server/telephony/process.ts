import "server-only";
import type { Db } from "../supabaseAdmin";
import { normalizePhone } from "../phone";
import type { CallEvent } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MANUAL_MATCH_WINDOW_MS = 15 * 60_000;

// Drops undefined so an event that lacks a field never erases what is stored.
const defined = (o: Row): Row => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

async function agentFor(db: Db, orgId: string, email?: string): Promise<{ id: string; name: string | null } | null> {
  if (!email) return null;
  const { data: user } = await db.from("users").select("id, full_name").ilike("email", email).maybeSingle();
  if (!user) return null;
  const { data: member } = await db.from("memberships").select("id").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  return member ? { id: user.id, name: user.full_name } : null;
}

async function contactFor(db: Db, orgId: string, digits: string | null): Promise<string | null> {
  if (!digits) return null;
  const { data } = await db.from("contacts").select("id").eq("org_id", orgId).eq("phone_digits", digits).order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

// Applies one provider event to the org's calls log. Safe to run twice: the
// call is found by (org, provider call id), only known fields are written,
// and the event id is recorded.
export async function applyCallEvent(db: Db, orgId: string, provider: string, e: CallEvent): Promise<"applied" | "duplicate"> {
  const seen = await db.from("call_event_log").select("event_id").eq("org_id", orgId).eq("provider", provider).eq("event_id", e.eventId).maybeSingle();
  if (seen.data) return "duplicate";

  const agent = await agentFor(db, orgId, e.agentEmail);
  const patch = defined({
    direction: e.direction,
    status: e.status,
    from_number: e.from,
    to_number: e.to,
    started_at: e.startedAt,
    ended_at: e.endedAt,
    duration_seconds: e.durationSeconds,
    wait_seconds: e.waitSeconds,
    recording_url: e.recordingUrl,
    recording_duration_seconds: e.recordingDurationSeconds,
    agent_email: e.agentEmail,
    agent_name: e.agentName ?? agent?.name ?? undefined,
    agent_user_id: agent?.id,
    provider,
  });

  const { data: existing } = await db.from("calls").select("id, direction, from_number, to_number, contact_id").eq("org_id", orgId).eq("external_ref", e.callRef).maybeSingle();

  if (existing) {
    const extra: Row = {};
    if (!existing.contact_id) {
      const dir = e.direction ?? existing.direction;
      const other = dir === "inbound" ? (e.from ?? existing.from_number) : (e.to ?? existing.to_number);
      const contactId = await contactFor(db, orgId, normalizePhone(other));
      if (contactId) extra.contact_id = contactId;
    }
    await db.from("calls").update({ ...patch, ...extra }).eq("id", existing.id);
  } else {
    const direction = e.direction ?? "outbound";
    const contactId = await contactFor(db, orgId, normalizePhone(direction === "inbound" ? e.from : e.to));
    const startedAt = e.startedAt ?? new Date().toISOString();

    // An outbound call the agent started from the CRM (tel: link) and the
    // phone system now reports are the same call: merge instead of doubling.
    let merged = false;
    if (direction === "outbound" && contactId && agent) {
      const from = new Date(Date.parse(startedAt) - MANUAL_MATCH_WINDOW_MS).toISOString();
      const to = new Date(Date.parse(startedAt) + MANUAL_MATCH_WINDOW_MS).toISOString();
      const { data: attempt } = await db
        .from("calls")
        .select("id")
        .eq("org_id", orgId)
        .eq("contact_id", contactId)
        .eq("agent_user_id", agent.id)
        .eq("source", "manual")
        .is("external_ref", null)
        .gte("started_at", from)
        .lte("started_at", to)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (attempt) {
        // The agent's own outcome/notes stay; the phone system supplies facts.
        await db.from("calls").update({ ...patch, external_ref: e.callRef }).eq("id", attempt.id);
        merged = true;
      }
    }
    if (!merged) {
      const { error } = await db.from("calls").insert({
        org_id: orgId,
        contact_id: contactId,
        direction,
        started_at: startedAt,
        ...patch,
        external_ref: e.callRef,
        source: "provider",
        after_call_done: true,
      });
      // Two events for a brand-new call raced each other: the other one won, apply ours on top.
      if (error?.code === "23505") {
        await db.from("calls").update(patch).eq("org_id", orgId).eq("external_ref", e.callRef);
      } else if (error) throw error;
    }
  }

  await db.from("call_event_log").upsert({ org_id: orgId, provider, event_id: e.eventId }, { onConflict: "org_id,provider,event_id", ignoreDuplicates: true });
  return "applied";
}

export async function handleCallsPayload(db: Db, payload: Row): Promise<string[]> {
  const { data: connection } = await db.from("telephony_connections").select("id, org_id, provider, enabled").eq("id", payload.connection_id).maybeSingle();
  if (!connection) return ["חיבור טלפוניה שנמחק"];
  if (!connection.enabled) return ["חיבור הטלפוניה כבוי"];
  const notes: string[] = [];
  for (const e of (payload.events ?? []) as CallEvent[]) {
    const result = await applyCallEvent(db, connection.org_id, connection.provider, e);
    if (result === "duplicate") notes.push(`אירוע כפול ${e.eventId}`);
  }
  return notes;
}
