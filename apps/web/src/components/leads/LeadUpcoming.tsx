"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { TaskRow } from "./TaskRow";

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "+ משימה": a task on this lead (what to do, by when, for whom) without leaving the card.
function AddTaskSheet({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { addTask, members, currentMemberId } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => localDay(new Date(Date.now() + 86400000)));
  const [assignee, setAssignee] = useState(me?.name ?? "");
  const [busy, setBusy] = useState(false);
  const field = "w-full px-2 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await addTask({ title: title.trim(), contactId: contact.id, assignee: assignee || undefined, dueDate: due || undefined });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`משימה חדשה — ${contact.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">מה צריך לעשות</span>
          <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: לחזור אליו עם הצעה" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">תאריך יעד</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </label>
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">אחראי</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
              <option value="">ללא</option>
              {members
                .filter((m) => m.status === "active")
                .map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={!title.trim() || busy} className="w-full py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-40">
          {busy ? "שומר…" : "הוספת משימה"}
        </button>
      </form>
    </Sheet>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// What's coming up for the lead — meetings, queued messages, open tasks — as
// a one-line summary that opens the full list in a window, so it never
// stretches the lead card.
export function LeadUpcoming({ contact }: { contact: Contact }) {
  const { tasks, appointments, scheduledMessages, cancelScheduledMessage, deleteAppointment } = useStore();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const leadTasks = tasks.filter((t) => t.contactId === contact.id && !t.done);
  const queued = scheduledMessages.filter((m) => m.contactId === contact.id && (m.status === "pending" || m.status === "failed")).sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  const upcoming = appointments.filter((a) => a.contactId === contact.id && a.startAt >= nowIso).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const addButton = (
    <button onClick={() => setAdding(true)} className="mb-5 text-sm px-3 py-1.5 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-500">
      + משימה
    </button>
  );
  const addSheet = adding ? <AddTaskSheet contact={contact} onClose={() => setAdding(false)} /> : null;
  if (!leadTasks.length && !upcoming.length && !queued.length)
    return (
      <>
        {addButton}
        {addSheet}
      </>
    );

  const overdue = leadTasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const failed = queued.filter((m) => m.status === "failed").length;
  const parts: React.ReactNode[] = [];
  if (upcoming[0]) parts.push(<span key="m">📅 {upcoming[0].title} · {when(upcoming[0].startAt)}{upcoming.length > 1 ? ` (+${upcoming.length - 1})` : ""}</span>);
  if (leadTasks.length) parts.push(<span key="t" className={overdue ? "text-red-500" : ""}>✔ {leadTasks.length} משימות{overdue ? ` (${overdue} באיחור)` : ""}</span>);
  if (queued.length) parts.push(<span key="q" className={failed ? "text-red-500" : ""}>⏰ {queued.length} הודעות מתוזמנות{failed ? ` (${failed} נכשלו)` : ""}</span>);

  return (
    <>
      <div className="mb-5 flex items-stretch gap-2">
      <button
        onClick={() => setOpen(true)}
        className="flex-1 min-w-0 flex items-center gap-3 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-start hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <span className="flex-1 min-w-0 flex flex-wrap gap-x-3 gap-y-0.5">{parts}</span>
        <span className="text-xs text-neutral-400 shrink-0">הצגת הכל ‹</span>
      </button>
      <button onClick={() => setAdding(true)} className="shrink-0 px-3 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100" title="משימה חדשה לליד">
        + משימה
      </button>
      </div>
      {addSheet}
      {open && (
        <Sheet title={`מתוכנן עבור ${contact.name}`} onClose={() => setOpen(false)}>
          {upcoming.length > 0 && (
            <section className="mb-4">
              <h3 className="text-xs font-medium text-neutral-500 mb-1">פגישות</h3>
              {upcoming.map((a) => (
                <p key={a.id} className="text-sm py-1 flex items-center gap-2">
                  <span className="flex-1 min-w-0">
                    📅 {a.title} · {when(a.startAt)}
                  </span>
                  <button
                    onClick={() => window.confirm(`לבטל את הפגישה "${a.title}"? ההודעות המתוזמנות והמשימות של הפגישה יבוטלו, והיא תוסר מהיומן.`) && void deleteAppointment(a.id)}
                    className="text-xs text-red-500 hover:underline shrink-0"
                  >
                    ביטול פגישה
                  </button>
                </p>
              ))}
            </section>
          )}
          {queued.length > 0 && (
            <section className="mb-4">
              <h3 className="text-xs font-medium text-neutral-500 mb-1">הודעות מתוזמנות</h3>
              {queued.map((m) => (
                <p key={m.id} className="text-sm py-1 flex items-center gap-2">
                  <span className="flex-1 min-w-0">
                    ⏰ {m.label} · {when(m.sendAt)}
                    {m.status === "failed" && <span className="text-red-500"> · נכשל: {m.error}</span>}
                  </span>
                  {m.status === "pending" && (
                    <button onClick={() => cancelScheduledMessage(m.id)} className="text-xs text-neutral-400 hover:text-red-500 shrink-0">
                      ביטול
                    </button>
                  )}
                </p>
              ))}
            </section>
          )}
          {leadTasks.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-neutral-500 mb-1">משימות פתוחות</h3>
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {leadTasks.map((t) => (
                  <TaskRow key={t.id} task={t} showContact={false} />
                ))}
              </ul>
            </section>
          )}
        </Sheet>
      )}
    </>
  );
}
