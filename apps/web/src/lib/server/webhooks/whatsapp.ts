import "server-only";
import type { Db } from "../supabaseAdmin";
import { normalizePhone } from "../phone";
import { describeWhatsAppMessage, findOrCreateConversation, preview } from "../whatsapp";
import { cancelWaitingRunsOnReply } from "../automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

function tsToIso(ts: string | number | undefined): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

export async function channelByPhoneNumberId(db: Db, phoneNumberId: string): Promise<Row | null> {
  const { data } = await db
    .from("channels")
    .select("*")
    .eq("provider", "whatsapp_cloud")
    .eq("external_id", phoneNumberId)
    .maybeSingle();
  return data;
}

async function findOrCreateContact(
  db: Db,
  orgId: string,
  waId: string,
  profileName: string | null,
  source: string
): Promise<Row> {
  const digits = normalizePhone(waId) ?? waId;
  const { data: existing } = await db
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("phone_digits", digits)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing) {
    const placeholder = existing.name === `+${digits}` || existing.name === digits;
    if (placeholder && profileName) await db.from("contacts").update({ name: profileName }).eq("id", existing.id);
    return existing;
  }
  const { data, error } = await db
    .from("contacts")
    .insert({ org_id: orgId, name: profileName || `+${digits}`, phone: `+${digits}`, source })
    .select("id, name")
    .single();
  if (error || !data) throw error ?? new Error("יצירת ליד נכשלה");
  return data;
}

async function touchConversation(db: Db, conversationId: string, at: string, previewText: string) {
  const { data: conv } = await db.from("conversations").select("last_message_at").eq("id", conversationId).single();
  if (conv?.last_message_at && conv.last_message_at > at) return;
  await db.from("conversations").update({ last_message_at: at, last_message_preview: previewText }).eq("id", conversationId);
}

export async function handleMessagesField(db: Db, channel: Row, value: Row): Promise<void> {
  const profiles = new Map<string, string>();
  for (const c of value.contacts ?? []) if (c.wa_id && c.profile?.name) profiles.set(c.wa_id, c.profile.name);

  for (const msg of value.messages ?? []) {
    const contact = await findOrCreateContact(db, channel.org_id, msg.from, profiles.get(msg.from) ?? null, "וואטסאפ");
    const conversation = await findOrCreateConversation(db, {
      orgId: channel.org_id,
      channelId: channel.id,
      contactId: contact.id,
      waId: normalizePhone(msg.from) ?? msg.from,
    });
    const { type, body } = describeWhatsAppMessage(msg);
    const at = tsToIso(msg.timestamp);
    const { data: inserted } = await db
      .from("messages")
      .upsert(
        {
          org_id: channel.org_id,
          conversation_id: conversation.id,
          direction: "inbound",
          type,
          body,
          payload: msg,
          external_id: msg.id,
          status: "received",
          created_at: at,
        },
        { onConflict: "org_id,external_id", ignoreDuplicates: true }
      )
      .select("id");
    if (!inserted?.length) continue; // redelivery of a message we already have
    await db.rpc("bump_conversation_inbound", { conv_id: conversation.id, at, preview: preview(body) });
    await cancelWaitingRunsOnReply(db, channel.org_id, contact.id);
  }

  for (const st of value.statuses ?? []) {
    const next = String(st.status ?? "").toLowerCase();
    if (!(next in STATUS_RANK)) continue;
    const { data: message } = await db
      .from("messages")
      .select("id, status")
      .eq("org_id", channel.org_id)
      .eq("external_id", st.id)
      .maybeSingle();
    if (!message) continue;
    // Webhooks can arrive out of order; never move a message backwards.
    if ((STATUS_RANK[message.status] ?? -1) >= STATUS_RANK[next] && next !== "failed") continue;
    const err = st.errors?.[0];
    await db
      .from("messages")
      .update({ status: next, ...(err ? { error: err.error_data?.details || err.message || err.title } : {}) })
      .eq("id", message.id);
  }
}

// Coexistence: a message typed in the WhatsApp Business app on the phone.
export async function handleEchoesField(db: Db, channel: Row, value: Row): Promise<void> {
  for (const echo of value.message_echoes ?? []) {
    if (echo.type === "revoke" && echo.revoke?.original_message_id) {
      await db
        .from("messages")
        .update({ body: "[ההודעה נמחקה]" })
        .eq("org_id", channel.org_id)
        .eq("external_id", echo.revoke.original_message_id);
      continue;
    }
    if (echo.type === "edit" && echo.edit?.original_message_id) {
      const { body } = describeWhatsAppMessage(echo.edit.message ?? {});
      await db
        .from("messages")
        .update({ body: `${body} (נערך)` })
        .eq("org_id", channel.org_id)
        .eq("external_id", echo.edit.original_message_id);
      continue;
    }
    const contact = await findOrCreateContact(db, channel.org_id, echo.to, null, "וואטסאפ");
    const conversation = await findOrCreateConversation(db, {
      orgId: channel.org_id,
      channelId: channel.id,
      contactId: contact.id,
      waId: normalizePhone(echo.to) ?? echo.to,
    });
    const { type, body } = describeWhatsAppMessage(echo);
    const at = tsToIso(echo.timestamp);
    const { data: inserted } = await db
      .from("messages")
      .upsert(
        {
          org_id: channel.org_id,
          conversation_id: conversation.id,
          direction: "outbound",
          origin: "phone_app",
          type,
          body,
          payload: echo,
          external_id: echo.id,
          status: "sent",
          created_at: at,
        },
        { onConflict: "org_id,external_id", ignoreDuplicates: true }
      )
      .select("id");
    if (inserted?.length) await touchConversation(db, conversation.id, at, preview(body));
  }
}

const HISTORY_STATUS: Record<string, string> = {
  READ: "read",
  PLAYED: "read",
  DELIVERED: "delivered",
  SENT: "sent",
  ERROR: "failed",
  PENDING: "pending",
};

// Coexistence onboarding: up to 6 months of the app's chats, in chunks.
export async function handleHistoryField(db: Db, channel: Row, value: Row): Promise<string | null> {
  const businessDigits = normalizePhone(value.metadata?.display_phone_number);
  const notes: string[] = [];

  for (const chunk of value.history ?? []) {
    if (chunk.errors?.length) {
      notes.push(`סנכרון היסטוריה נדחה: ${chunk.errors[0].title ?? chunk.errors[0].message}`);
      continue;
    }
    for (const thread of chunk.threads ?? []) {
      const contact = await findOrCreateContact(db, channel.org_id, thread.id, null, "היסטוריית וואטסאפ");
      const conversation = await findOrCreateConversation(db, {
        orgId: channel.org_id,
        channelId: channel.id,
        contactId: contact.id,
        waId: normalizePhone(thread.id) ?? thread.id,
      });

      let latest: { at: string; body: string } | null = null;
      let latestInbound: string | null = null;
      const rows = (thread.messages ?? []).map((m: Row) => {
        const inbound = normalizePhone(m.from) !== businessDigits;
        const { type, body } = describeWhatsAppMessage(m);
        const at = tsToIso(m.timestamp);
        if (!latest || at > latest.at) latest = { at, body };
        if (inbound && (!latestInbound || at > latestInbound)) latestInbound = at;
        return {
          org_id: channel.org_id,
          conversation_id: conversation.id,
          direction: inbound ? "inbound" : "outbound",
          origin: inbound ? null : "history",
          type,
          body,
          payload: m,
          external_id: m.id,
          status: inbound ? "received" : HISTORY_STATUS[String(m.history_context?.status ?? "").toUpperCase()] ?? "sent",
          created_at: at,
        };
      });

      for (let i = 0; i < rows.length; i += 500) {
        await db.from("messages").upsert(rows.slice(i, i + 500), { onConflict: "org_id,external_id", ignoreDuplicates: true });
      }

      const { data: conv } = await db
        .from("conversations")
        .select("last_message_at, last_inbound_at")
        .eq("id", conversation.id)
        .single();
      const patch: Row = {};
      const newest = latest as { at: string; body: string } | null;
      if (newest && (!conv?.last_message_at || newest.at > conv.last_message_at)) {
        patch.last_message_at = newest.at;
        patch.last_message_preview = preview(newest.body);
      }
      if (latestInbound && (!conv?.last_inbound_at || latestInbound > conv.last_inbound_at)) patch.last_inbound_at = latestInbound;
      if (Object.keys(patch).length) await db.from("conversations").update(patch).eq("id", conversation.id);
    }
  }
  return notes.length ? notes.join("; ") : null;
}

// Coexistence: the phone's address book. Only used to replace placeholder
// names ("+9725...") on contacts we already have — never creates leads, or
// every personal contact on the business phone would become one.
export async function handleStateSyncField(db: Db, channel: Row, value: Row): Promise<void> {
  for (const item of value.state_sync ?? []) {
    if (item.type !== "contact" || item.action === "remove") continue;
    const name = item.contact?.full_name || item.contact?.first_name;
    const digits = normalizePhone(item.contact?.phone_number);
    if (!name || !digits) continue;
    await db
      .from("contacts")
      .update({ name })
      .eq("org_id", channel.org_id)
      .eq("phone_digits", digits)
      .in("name", [`+${digits}`, digits]);
  }
}
