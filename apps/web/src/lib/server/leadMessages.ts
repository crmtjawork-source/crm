import "server-only";
import type { Db } from "./supabaseAdmin";
import { renderTemplate } from "@/lib/templates";
import type { Appointment, Contact } from "@/lib/types";
import { sendToContact } from "./whatsapp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Renders a ready-made message (or takes free text) for a lead, filling in
// the lead, the sending agent and the meeting.
export async function composeForLead(
  db: Db,
  args: { orgId: string; contactId: string; userId?: string | null; templateId?: string | null; text?: string | null; appointmentId?: string | null; origin?: string }
): Promise<{ text: string; templateName: string | null; contact: Row }> {
  const { data: contact } = await db.from("contacts").select("*").eq("id", args.contactId).eq("org_id", args.orgId).maybeSingle();
  if (!contact) throw new Error("הליד לא נמצא");
  let templateName: string | null = null;
  let text = args.text?.trim() ?? "";
  if (!text && args.templateId) {
    const { data: template } = await db.from("message_templates").select("name, body").eq("id", args.templateId).eq("org_id", args.orgId).maybeSingle();
    if (!template) throw new Error("ההודעה המוכנה לא נמצאה");
    templateName = template.name;
    const { data: user } = args.userId ? await db.from("users").select("full_name, email").eq("id", args.userId).maybeSingle() : { data: null };
    const { data: appt } = args.appointmentId ? await db.from("appointments").select("*").eq("id", args.appointmentId).maybeSingle() : { data: null };
    text = renderTemplate(template.body, {
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone ?? undefined,
        email: contact.email ?? undefined,
        fields: contact.fields ?? {},
        tags: contact.tags ?? [],
        attribution: {},
        noAnswerCount: contact.no_answer_count ?? 0,
        bookingToken: contact.booking_token ?? undefined,
        createdAt: contact.created_at,
      } as Contact,
      agentName: user?.full_name || undefined,
      appointment: appt ? ({ id: appt.id, typeId: appt.type_id, title: appt.title, startAt: appt.start_at, endAt: appt.end_at, notes: appt.notes ?? undefined, createdAt: appt.created_at } as Appointment) : undefined,
      origin: args.origin,
      bookingToken: contact.booking_token ?? undefined,
    });
  }
  return { text, templateName, contact };
}

// Sends through a linked personal WhatsApp and notes it on the lead's timeline.
export async function sendLeadMessage(
  db: Db,
  args: { orgId: string; channelId: string; contactId: string; text: string; label: string; userId?: string | null; origin: "crm" | "automation" }
) {
  if (!args.text.trim()) throw new Error("ההודעה ריקה");
  const message = await sendToContact(db, {
    orgId: args.orgId,
    contactId: args.contactId,
    channelId: args.channelId,
    content: { kind: "text", body: args.text },
    origin: args.origin,
    sentBy: args.userId ?? null,
  });
  await db.from("activities").insert({ org_id: args.orgId, contact_id: args.contactId, type: "note", text: `💬 ${args.label}\n${args.text}` });
  return message;
}

// Sends reminders whose time has come. Each row is claimed first, so two
// overlapping cron runs never send the same reminder twice.
export async function sendDueScheduledMessages(db: Db): Promise<number> {
  // A run that died mid-send leaves rows in "sending". Whether WhatsApp got
  // the message is unknown, so they're marked failed rather than resent.
  await db
    .from("scheduled_messages")
    .update({ status: "failed", error: "השליחה נקטעה — לא ידוע אם ההודעה יצאה" })
    .eq("status", "sending")
    .lt("send_at", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: due } = await db
    .from("scheduled_messages")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .order("send_at")
    .limit(25);
  let sent = 0;
  for (const row of due ?? []) {
    const { data: claimed } = await db.from("scheduled_messages").update({ status: "sending" }).eq("id", row.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    try {
      if (!row.channel_id) throw new Error("אין חיבור וואטסאפ לשליחה");
      if (row.appointment_id) {
        const { data: appt } = await db.from("appointments").select("start_at").eq("id", row.appointment_id).maybeSingle();
        if (!appt || new Date(appt.start_at).getTime() < Date.now()) {
          await db.from("scheduled_messages").update({ status: "cancelled", error: "הפגישה כבר עברה" }).eq("id", row.id);
          continue;
        }
      }
      const { text } = await composeForLead(db, { orgId: row.org_id, contactId: row.contact_id, userId: row.created_by, templateId: row.template_id, appointmentId: row.appointment_id });
      await sendLeadMessage(db, { orgId: row.org_id, channelId: row.channel_id, contactId: row.contact_id, text, label: `נשלח אוטומטית: ${row.label}`, userId: row.created_by, origin: "automation" });
      await db.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      sent++;
    } catch (err) {
      await db.from("scheduled_messages").update({ status: "failed", error: err instanceof Error ? err.message : String(err) }).eq("id", row.id);
    }
  }
  return sent;
}
