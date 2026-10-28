"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { TaskRow } from "./TaskRow";

const when = (iso: string) => new Date(iso).toLocaleString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// What's coming up for the lead — meetings, queued messages, open tasks — as
// a one-line summary that opens the full list in a window, so it never
// stretches the lead card.
export function LeadUpcoming({ contact }: { contact: Contact }) {
  const { tasks, appointments, scheduledMessages, cancelScheduledMessage, deleteAppointment } = useStore();
  const [open, setOpen] = useState(false);
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const leadTasks = tasks.filter((t) => t.contactId === contact.id && !t.done);
  const queued = scheduledMessages.filter((m) => m.contactId === contact.id && (m.status === "pending" || m.status === "failed")).sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  const upcoming = appointments.filter((a) => a.contactId === contact.id && a.startAt >= nowIso).sort((a, b) => a.startAt.localeCompare(b.startAt));
  if (!leadTasks.length && !upcoming.length && !queued.length) return null;

  const overdue = leadTasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const failed = queued.filter((m) => m.status === "failed").length;
  const parts: React.ReactNode[] = [];
  if (upcoming[0]) parts.push(<span key="m">📅 {upcoming[0].title} · {when(upcoming[0].startAt)}{upcoming.length > 1 ? ` (+${upcoming.length - 1})` : ""}</span>);
  if (leadTasks.length) parts.push(<span key="t" className={overdue ? "text-red-500" : ""}>✔ {leadTasks.length} משימות{overdue ? ` (${overdue} באיחור)` : ""}</span>);
  if (queued.length) parts.push(<span key="q" className={failed ? "text-red-500" : ""}>⏰ {queued.length} הודעות מתוזמנות{failed ? ` (${failed} נכשלו)` : ""}</span>);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mb-5 flex items-center gap-3 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-start hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <span className="flex-1 min-w-0 flex flex-wrap gap-x-3 gap-y-0.5">{parts}</span>
        <span className="text-xs text-neutral-400 shrink-0">הצגת הכל ‹</span>
      </button>
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
