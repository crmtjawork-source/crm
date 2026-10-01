import "server-only";
import type { Db } from "./supabaseAdmin";
import { triggerAutomations } from "./automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Availability rules are stored as wall-clock times ("09:00") in the
// business's local time, while servers run in UTC. Every tenant is Israeli
// today — make the timezone a per-org setting before that changes.
const TZ = "Asia/Jerusalem";
const DAYS_AHEAD = 14;
const MIN_NOTICE_MINUTES = 60;

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute"), ss: get("second") };
}

function offsetMinutes(date: Date): number {
  const p = zonedParts(date);
  return (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - date.getTime()) / 60_000;
}

// Wall-clock time in TZ → the actual instant. The second pass corrects the
// guess on DST-transition days.
function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const first = new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
  const second = offsetMinutes(first);
  return new Date(guess.getTime() - second * 60_000);
}

const dayLabel = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long", day: "numeric", month: "numeric" });
const timeLabel = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function formatSlot(iso: string): string {
  const date = new Date(iso);
  return `${dayLabel.format(date)} בשעה ${timeLabel.format(date)}`;
}

export type SlotDay = { label: string; slots: Array<{ start: string; label: string }> };

async function bookableType(db: Db, orgId: string): Promise<Row | null> {
  const { data } = await db
    .from("appointment_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("public_booking", true)
    .order("name")
    .limit(1)
    .maybeSingle();
  return data;
}

async function freeSlots(db: Db, orgId: string, type: Row, excludeAppointmentId?: string): Promise<SlotDay[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + (DAYS_AHEAD + 1) * 24 * 60 * 60_000);
  const [{ data: rules }, { data: busy }] = await Promise.all([
    db.from("availability_rules").select("*").eq("org_id", orgId),
    db
      .from("appointments")
      .select("id, start_at, end_at")
      .eq("org_id", orgId)
      .lt("start_at", windowEnd.toISOString())
      .gt("end_at", now.toISOString()),
  ]);
  const taken = (busy ?? [])
    .filter((a: Row) => a.id !== excludeAppointmentId)
    .map((a: Row) => [new Date(a.start_at).getTime(), new Date(a.end_at).getTime()]);
  const durationMs = Number(type.duration_minutes || 30) * 60_000;
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60_000;
  const today = zonedParts(now);

  const days: SlotDay[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const local = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const [y, m, d, weekday] = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), local.getUTCDay()];
    const slots: SlotDay["slots"] = [];
    for (const rule of (rules ?? []).filter((r: Row) => r.day === weekday)) {
      const [sh, sm] = String(rule.start_time).split(":").map(Number);
      const [eh, em] = String(rule.end_time).split(":").map(Number);
      const ruleEnd = zonedToUtc(y, m, d, eh, em).getTime();
      for (let start = zonedToUtc(y, m, d, sh, sm).getTime(); start + durationMs <= ruleEnd; start += durationMs) {
        const end = start + durationMs;
        if (start < earliest) continue;
        if (taken.some(([bs, be]) => start < be && end > bs)) continue;
        const iso = new Date(start).toISOString();
        slots.push({ start: iso, label: timeLabel.format(new Date(start)) });
      }
    }
    if (slots.length) days.push({ label: dayLabel.format(local), slots: slots.sort((a, b) => a.start.localeCompare(b.start)) });
  }
  return days;
}

async function contactByToken(db: Db, token: string): Promise<Row | null> {
  if (!/^[a-f0-9]{16}$/.test(token)) return null;
  const { data } = await db.from("contacts").select("id, org_id, name").eq("booking_token", token).maybeSingle();
  return data;
}

async function upcomingBooking(db: Db, contact: Row, typeId: string): Promise<Row | null> {
  const { data } = await db
    .from("appointments")
    .select("*")
    .eq("contact_id", contact.id)
    .eq("type_id", typeId)
    .gt("start_at", new Date().toISOString())
    .order("start_at")
    .limit(1)
    .maybeSingle();
  return data;
}

export type BookingView =
  | { status: "not_found" }
  | { status: "unavailable"; orgName: string }
  | {
      status: "open";
      firstName: string;
      orgName: string;
      typeName: string;
      durationMinutes: number;
      days: SlotDay[];
      existing: { start: string; label: string } | null;
    };

export async function getBookingView(db: Db, token: string): Promise<BookingView> {
  const contact = await contactByToken(db, token);
  if (!contact) return { status: "not_found" };
  const { data: org } = await db.from("organizations").select("name").eq("id", contact.org_id).single();
  const orgName = org?.name ?? "";
  const type = await bookableType(db, contact.org_id);
  if (!type) return { status: "unavailable", orgName };
  const existing = await upcomingBooking(db, contact, type.id);
  return {
    status: "open",
    firstName: String(contact.name ?? "").trim().split(/\s+/)[0] ?? "",
    orgName,
    typeName: type.name,
    durationMinutes: type.duration_minutes,
    days: await freeSlots(db, contact.org_id, type, existing?.id),
    existing: existing ? { start: existing.start_at, label: formatSlot(existing.start_at) } : null,
  };
}

export class BookingError extends Error {}

export async function bookSlot(db: Db, token: string, start: string): Promise<{ start: string; label: string; rescheduled: boolean }> {
  const contact = await contactByToken(db, token);
  if (!contact) throw new BookingError("הקישור לא תקין");
  const type = await bookableType(db, contact.org_id);
  if (!type) throw new BookingError("קביעת שיחה אונליין לא זמינה כרגע");

  const existing = await upcomingBooking(db, contact, type.id);
  // Re-derive availability on the server: the client's list may be stale
  // and must never be trusted to decide what is free.
  const days = await freeSlots(db, contact.org_id, type, existing?.id);
  if (!days.some((d) => d.slots.some((s) => s.start === start))) {
    throw new BookingError("השעה הזו כבר לא פנויה — בחרו שעה אחרת");
  }

  const startAt = new Date(start);
  const endAt = new Date(startAt.getTime() + Number(type.duration_minutes || 30) * 60_000);
  const label = formatSlot(startAt.toISOString());

  if (existing) {
    await db
      .from("appointments")
      .update({ start_at: startAt.toISOString(), end_at: endAt.toISOString() })
      .eq("id", existing.id);
  } else {
    const { error } = await db.from("appointments").insert({
      org_id: contact.org_id,
      contact_id: contact.id,
      type_id: type.id,
      title: `${type.name} — ${contact.name}`,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      notes: "נקבע על ידי הליד בקישור האישי",
    });
    if (error) throw error;
  }

  const verb = existing ? "שינה/תה את מועד" : "קבע/ה";
  await db.from("activities").insert({
    org_id: contact.org_id,
    contact_id: contact.id,
    type: "note",
    text: `📅 ${verb} ${type.name} ל${label}`,
  });
  await db.from("notifications").insert({
    org_id: contact.org_id,
    contact_id: contact.id,
    text: `${contact.name} ${verb} ${type.name} ל${label}`,
  });

  if (!existing) await triggerAutomations(db, contact.org_id, "appointment_booked", contact.id);
  return { start: startAt.toISOString(), label, rescheduled: !!existing };
}
