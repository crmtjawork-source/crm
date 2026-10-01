import "server-only";
import type { Db } from "../supabaseAdmin";
import {
  channelByPhoneNumberId,
  handleEchoesField,
  handleHistoryField,
  handleMessagesField,
  handleStateSyncField,
} from "./whatsapp";
import { handleLeadgenChange } from "./leadgen";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MAX_ATTEMPTS = 5;

async function dispatch(db: Db, payload: Row): Promise<string[]> {
  const notes: string[] = [];

  if (payload.object === "whatsapp_business_account") {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const channel = phoneNumberId ? await channelByPhoneNumberId(db, String(phoneNumberId)) : null;
        if (!channel) {
          notes.push(`מספר וואטסאפ לא מחובר למערכת: ${phoneNumberId ?? "?"}`);
          continue;
        }
        switch (change.field) {
          case "messages":
            await handleMessagesField(db, channel, value);
            break;
          case "smb_message_echoes":
            await handleEchoesField(db, channel, value);
            break;
          case "history": {
            const note = await handleHistoryField(db, channel, value);
            if (note) notes.push(note);
            break;
          }
          case "smb_app_state_sync":
            await handleStateSyncField(db, channel, value);
            break;
          default:
            notes.push(`שדה webhook שלא מטופל: ${change.field}`);
        }
      }
    }
  } else if (payload.object === "page") {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const note = await handleLeadgenChange(db, change.value ?? {});
        if (note) notes.push(note);
      }
    }
  } else {
    notes.push(`סוג אובייקט לא נתמך: ${payload.object}`);
  }

  return notes;
}

export async function processWebhookEvent(db: Db, eventId: string): Promise<void> {
  const { data: event } = await db.from("webhook_events").select("*").eq("id", eventId).single();
  if (!event || event.status === "processed") return;
  const attempts = (event.attempts ?? 0) + 1;
  await db.from("webhook_events").update({ attempts }).eq("id", eventId);

  try {
    const notes = await dispatch(db, event.payload);
    await db
      .from("webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error: notes.length ? notes.join("; ") : null })
      .eq("id", eventId);
  } catch (err) {
    console.error("webhook processing failed", eventId, err);
    await db
      .from("webhook_events")
      .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .eq("id", eventId);
  }
}

// Picks up events whose processing failed (or never ran because the
// instance died right after acknowledging).
export async function retryPendingWebhookEvents(db: Db): Promise<number> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
  const { data: events } = await db
    .from("webhook_events")
    .select("id")
    .neq("status", "processed")
    .lt("attempts", MAX_ATTEMPTS)
    .lt("received_at", oneMinuteAgo)
    .gt("received_at", twoDaysAgo)
    .order("received_at")
    .limit(25);
  for (const e of events ?? []) await processWebhookEvent(db, e.id);
  return (events ?? []).length;
}
