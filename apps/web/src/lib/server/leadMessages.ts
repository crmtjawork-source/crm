import "server-only";
import type { Db } from "./supabaseAdmin";
import { isOnlineMeeting, renderTemplate } from "@/lib/templates";
import type { Appointment, Contact } from "@/lib/types";
import { sendToContact, userGatewayChannel, type MediaType } from "./whatsapp";
import { env } from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type Attachment = { url: string; type: MediaType; name?: string | null };

// Renders a ready-made message (or takes free text) for a lead, filling in
// the lead, the sending agent and the meeting. A template's file comes along.
export async function composeForLead(
  db: Db,
  args: { orgId: string; contactId: string; userId?: string | null; templateId?: string | null; text?: string | null; appointmentId?: string | null; origin?: string }
): Promise<{ text: string; templateName: string | null; attachment: Attachment | null; contact: Row }> {
  const { data: contact } = await db.from("contacts").select("*").eq("id", args.contactId).eq("org_id", args.orgId).maybeSingle();
  if (!contact) throw new Error("הליד לא נמצא");
  let text = args.text?.trim() ?? "";
  if (!args.templateId) return { text, templateName: null, attachment: null, contact };

  let { data: template } = await db
    .from("message_templates")
    .select("name, body, quick_action, attachment_url, attachment_type, attachment_name")
    .eq("id", args.templateId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!template) throw new Error("ההודעה המוכנה לא נמצאה");

  let appt: Row | null = null;
  if (!text) {
    let appointmentId = args.appointmentId ?? null;
    // A meeting message sent by an automation (e.g. stage → "meeting set")
    // uses the lead's next meeting on the calendar.
    if (!appointmentId && /\{\{\s*meeting_/.test(template.body)) {
      const { data: next } = await db
        .from("appointments")
        .select("id")
        .eq("contact_id", args.contactId)
        .gt("end_at", new Date().toISOString())
        .order("start_at")
        .limit(1)
        .maybeSingle();
      if (!next) throw new Error("אין לליד פגישה עתידית ביומן — ההודעה לא נשלחה");
      appointmentId = next.id;
    }
    if (appointmentId) ({ data: appt } = await db.from("appointments").select("*, appointment_types(name)").eq("id", appointmentId).maybeSingle());
    // Online vs. in-person confirmation, by the meeting's type.
    if (appt && (template.quick_action === "meeting_online" || template.quick_action === "meeting_office")) {
      const want = isOnlineMeeting(appt.appointment_types?.name ?? appt.title ?? "") ? "meeting_online" : "meeting_office";
      if (want !== template.quick_action) {
        const { data: other } = await db
          .from("message_templates")
          .select("name, body, quick_action, attachment_url, attachment_type, attachment_name")
          .eq("org_id", args.orgId)
          .eq("quick_action", want)
          .maybeSingle();
        if (other) template = other;
      }
    }
    const { data: user } = args.userId ? await db.from("users").select("full_name").eq("id", args.userId).maybeSingle() : { data: null };
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
      origin: args.origin ?? env.appUrl(),
      bookingToken: contact.booking_token ?? undefined,
    });
  }
  const attachment = template.attachment_url ? { url: template.attachment_url, type: template.attachment_type as MediaType, name: template.attachment_name } : null;
  return { text, templateName: template.name, attachment, contact };
}

// Which WhatsApp sends to this lead: the lead owner's linked WhatsApp when
// asked for, otherwise (or when the owner has none) the business's default
// number.
export async function pickChannel(db: Db, orgId: string, contact: Row, preferOwner: boolean): Promise<string | null> {
  if (preferOwner && contact.owner_email) {
    const { data: u } = await db.from("users").select("id").ilike("email", contact.owner_email).maybeSingle();
    const own = u ? await userGatewayChannel(db, orgId, u.id) : null;
    if (own) return own.id;
  }
  const { data: def } = await db.from("channels").select("id").eq("org_id", orgId).eq("active", true).eq("is_default", true).limit(1).maybeSingle();
  return def?.id ?? null;
}

// Sends text and/or a file and notes it on the lead's timeline. A caption
// rides on the file when it fits; voice notes can't carry one, so the text
// goes first.
export async function sendLeadMessage(
  db: Db,
  args: { orgId: string; channelId: string; contactId: string; text: string; attachment?: Attachment | null; label: string; userId?: string | null; origin: "crm" | "automation" }
) {
  const text = args.text.trim();
  const file = args.attachment ?? null;
  if (!text && !file) throw new Error("ההודעה ריקה");
  const base = { orgId: args.orgId, contactId: args.contactId, channelId: args.channelId, origin: args.origin, sentBy: args.userId ?? null };
  const captionFits = file && file.type !== "voice" && text.length <= 1000;
  let message: Row | null = null;
  if (text && !captionFits) message = await sendToContact(db, { ...base, content: { kind: "text", body: text } });
  if (file) {
    message = await sendToContact(db, {
      ...base,
      content: { kind: "media", url: file.url, mediaType: file.type, fileName: file.name ?? undefined, caption: captionFits ? text : undefined },
    });
  }
  const fileNote = file ? ` + ${{ image: "תמונה", video: "סרטון", document: "קובץ", voice: "הקלטה" }[file.type]}` : "";
  await db.from("activities").insert({ org_id: args.orgId, contact_id: args.contactId, type: "note", text: `💬 ${args.label}${fileNote}\n${text}`.trim() });
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

  const { data: due } = await db.from("scheduled_messages").select("*").eq("status", "pending").lte("send_at", new Date().toISOString()).order("send_at").limit(25);
  let sent = 0;
  for (const row of due ?? []) {
    const { data: claimed } = await db.from("scheduled_messages").update({ status: "sending" }).eq("id", row.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    try {
      if (row.appointment_id) {
        const { data: appt } = await db.from("appointments").select("start_at").eq("id", row.appointment_id).maybeSingle();
        if (!appt || new Date(appt.start_at).getTime() < Date.now()) {
          await db.from("scheduled_messages").update({ status: "cancelled", error: "הפגישה כבר עברה" }).eq("id", row.id);
          continue;
        }
      }
      const { text, attachment, contact } = await composeForLead(db, { orgId: row.org_id, contactId: row.contact_id, userId: row.created_by, templateId: row.template_id, appointmentId: row.appointment_id });
      // Queued by the database (any meeting) → decided now: owner's WhatsApp, else the business number.
      const channelId = row.channel_id ?? (await pickChannel(db, row.org_id, contact, true));
      if (!channelId) throw new Error("אין חיבור וואטסאפ לשליחה");
      await sendLeadMessage(db, { orgId: row.org_id, channelId, contactId: row.contact_id, text, attachment, label: `נשלח אוטומטית: ${row.label}`, userId: row.created_by, origin: "automation" });
      await db.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      sent++;
    } catch (err) {
      await db.from("scheduled_messages").update({ status: "failed", error: err instanceof Error ? err.message : String(err) }).eq("id", row.id);
    }
  }
  return sent;
}
