"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { isOnlineMeeting } from "@/lib/templates";
import type { Appointment, Contact } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";

const input = "w-full px-2 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Schedules a meeting from the lead card: puts it on the calendar, moves the
// deal to the meeting stage, and creates reminder tasks (3 days / 1 day /
// morning of) that carry their ready-made message. Calls back with the
// meeting so the confirmation message can be sent right away.
export function MeetingSheet({ contact, onClose, onScheduled }: { contact: Contact; onClose: () => void; onScheduled: (a: Appointment, online: boolean) => void }) {
  const { appointmentTypes, messageTemplates, members, currentMemberId, addAppointment, addTask, updateContact } = useStore();
  const agentName = members.find((m) => m.id === currentMemberId)?.name;
  const [typeId, setTypeId] = useState(appointmentTypes[0]?.id ?? "");
  const [date, setDate] = useState(() => localDay(new Date(Date.now() + 86400000)));
  const [time, setTime] = useState("11:00");
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const type = appointmentTypes.find((t) => t.id === typeId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    setError("");
    try {
      const start = new Date(`${date}T${time}`);
      const end = new Date(start.getTime() + type.durationMinutes * 60000);
      const appointment = await addAppointment({
        contactId: contact.id,
        typeId: type.id,
        title: `${type.name} — ${contact.name}`,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        notes: where.trim() || undefined,
      });
      const today = localDay(new Date());
      const reminders: [string, number][] = [
        ["meeting_reminder_3d", 3],
        ["meeting_reminder_1d", 1],
        ["meeting_reminder_day", 0],
      ];
      for (const [action, daysBefore] of reminders) {
        const template = messageTemplates.find((t) => t.quickAction === action);
        const due = localDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() - daysBefore));
        if (!template || due < today) continue;
        await addTask({
          title: `לשלוח ל${contact.name}: ${template.name}`,
          contactId: contact.id,
          assignee: agentName,
          dueDate: due,
          templateId: template.id,
          appointmentId: appointment.id,
        });
      }
      if (contact.noAnswerCount) await updateContact(contact.id, { noAnswerCount: 0 });
      onScheduled(appointment, isOnlineMeeting(type.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "קביעת הפגישה נכשלה");
      setBusy(false);
    }
  }

  return (
    <Sheet title={`קביעת פגישה עם ${contact.name}`} onClose={onClose}>
      {appointmentTypes.length === 0 ? (
        <p className="text-sm text-neutral-500">עוד אין סוגי פגישות. מוסיפים אותם במסך היומן.</p>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">סוג פגישה</span>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={input}>
              {appointmentTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.durationMinutes} דק&apos;)
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="block text-neutral-500 mb-1">תאריך</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={input} />
            </label>
            <label className="block text-xs">
              <span className="block text-neutral-500 mb-1">שעה</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={input} />
            </label>
          </div>
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">{type && isOnlineMeeting(type.name) ? "קישור לפגישה (זום / Meet)" : "מיקום / הערות"}</span>
            <input value={where} onChange={(e) => setWhere(e.target.value)} dir="auto" className={input} />
          </label>
          <p className="text-xs text-neutral-400 leading-relaxed">
            הפגישה תיכנס ליומן, הליד יעבור לשלב &quot;נקבעה פגישה&quot;, ויווצרו משימות תזכורת עם הודעה מוכנה (3 ימים לפני, יום לפני ובבוקר
            הפגישה).
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50">
            {busy ? "שומר…" : "קביעת הפגישה"}
          </button>
        </form>
      )}
    </Sheet>
  );
}
