import type { Appointment, Contact } from "./types";
import { normalizePhone } from "./phone";

// Ready-made messages (message_templates) and the WhatsApp links agents
// send them through from their own phone.

export const QUICK_ACTIONS: { id: string; label: string }[] = [
  { id: "no_answer_1", label: "ללא מענה — ניסיון 1" },
  { id: "no_answer_2", label: "ללא מענה — ניסיון 2" },
  { id: "no_answer_3", label: "ללא מענה — ניסיון 3" },
  { id: "no_answer_4", label: "ללא מענה — ניסיון 4" },
  { id: "meeting_online", label: "אישור פגישה אונליין" },
  { id: "meeting_office", label: "אישור פגישה במשרד" },
  { id: "meeting_reminder_3d", label: "תזכורת 3 ימים לפני פגישה" },
  { id: "meeting_reminder_1d", label: "תזכורת יום לפני פגישה" },
  { id: "meeting_reminder_day", label: "תזכורת בבוקר הפגישה" },
  { id: "after_meeting", label: "אחרי פגישה" },
  { id: "send_document", label: "שליחת הצעה / הסכם לחתימה" },
];

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "first_name", label: "שם פרטי של הליד" },
  { key: "name", label: "שם מלא של הליד" },
  { key: "agent_first_name", label: "השם הפרטי שלך" },
  { key: "agent_name", label: "השם המלא שלך" },
  { key: "meeting_date", label: "תאריך הפגישה" },
  { key: "meeting_time", label: "שעת הפגישה" },
  { key: "meeting_location", label: "מיקום / קישור הפגישה" },
  { key: "meeting_link", label: "קישור לפגישה" },
  { key: "booking_link", label: "קישור לקביעת שיחה" },
  { key: "document_link", label: "קישור להצעה / הסכם לחתימה" },
  { key: "today", label: "התאריך של היום" },
];

const TZ = "Asia/Jerusalem";

export type TemplateContext = {
  contact: Contact;
  agentName?: string;
  appointment?: Appointment;
  origin?: string; // for {{booking_link}}
  bookingToken?: string;
  documentUrl?: string; // for {{document_link}}
};

export function renderTemplate(body: string, ctx: TemplateContext): string {
  const first = (s?: string) => (s ?? "").trim().split(/\s+/)[0] ?? "";
  const start = ctx.appointment ? new Date(ctx.appointment.startAt) : null;
  const notes = ctx.appointment?.notes ?? "";
  const values: Record<string, string> = {
    first_name: first(ctx.contact.name),
    name: ctx.contact.name,
    phone: ctx.contact.phone ?? "",
    email: ctx.contact.email ?? "",
    agent_first_name: first(ctx.agentName),
    agent_name: ctx.agentName ?? "",
    meeting_date: start ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(start) : "",
    meeting_time: start ? new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start) : "",
    meeting_location: notes,
    meeting_link: notes.match(/https?:\/\/\S+/)?.[0] ?? "",
    booking_link: ctx.origin && ctx.bookingToken ? `${ctx.origin}/book/${ctx.bookingToken}` : "",
    document_link: ctx.documentUrl ?? "",
    today: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()),
  };
  return body
    .replace(/\{\{\s*field:([^}]+?)\s*\}\}/g, (_, key: string) => ctx.contact.fields[key.trim()] ?? "")
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, key: string) => (key in values ? values[key] : all))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Opens the agent's own WhatsApp (app on a phone, WhatsApp Web/Desktop on a
// computer) on a chat with the lead, text filled in, ready to send.
export function whatsappLink(phone: string | undefined, text: string): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function isOnlineMeeting(typeName: string): boolean {
  return /זום|zoom|meet|אונליין|online|וידאו|video|teams/i.test(typeName);
}
