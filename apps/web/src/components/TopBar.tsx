"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { Appointment, Task } from "@/lib/types";

const TZ = "Asia/Jerusalem";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // yyyy-mm-dd
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const timeOf = (iso: string) => new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

type Tab = "today" | "tomorrow" | "week" | "overdue";
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "היום" },
  { id: "tomorrow", label: "מחר" },
  { id: "week", label: "השבוע" },
  { id: "overdue", label: "באיחור" },
];

// The signed-in member's tasks and meetings, by day.
function useAgenda(mineOnly: boolean) {
  const { tasks, appointments, members, currentMemberId } = useStore();
  const { session } = useAuth();
  const me = members.find((m) => m.id === currentMemberId);
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const t = setInterval(() => setToday(dayKey(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    const now = new Date(`${today}T12:00:00`);
    const tomorrow = dayKey(addDays(now, 1));
    const weekEnd = dayKey(addDays(now, 7));
    const myTasks = tasks.filter((t) => !t.done && (!mineOnly || t.assignee === me?.name));
    const myMeetings = appointments.filter((a) => !mineOnly || a.ownerUserId === session?.user.id);
    const meetingDay = (a: Appointment) => dayKey(new Date(a.startAt));
    const inRange = (from: string, to: string) => ({
      tasks: myTasks.filter((t) => t.dueDate && t.dueDate >= from && t.dueDate <= to),
      meetings: myMeetings.filter((a) => meetingDay(a) >= from && meetingDay(a) <= to).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    });
    return {
      today: inRange(today, today),
      tomorrow: inRange(tomorrow, tomorrow),
      week: inRange(today, weekEnd),
      overdue: { tasks: myTasks.filter((t) => t.dueDate && t.dueDate < today), meetings: [] as Appointment[] },
    };
  }, [tasks, appointments, mineOnly, me, session, today]);
}

function Panel({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Rendered on <body>: the blurred top bar would otherwise trap a fixed panel inside it.
  return createPortal(
    <div className="fixed inset-0 z-50">
      <button aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-black/20" />
      <aside className="absolute inset-y-0 end-0 w-full sm:w-[380px] bg-white dark:bg-neutral-950 shadow-2xl flex flex-col">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          {title}
          <button onClick={onClose} className="ms-auto text-xl leading-none text-neutral-400 px-1" aria-label="סגירה">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body
  );
}

function AgendaPanel({ onClose }: { onClose: () => void }) {
  const { contacts, toggleTask, addTask, members, currentMemberId } = useStore();
  const [tab, setTab] = useState<Tab>("today");
  const [mineOnly, setMineOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => dayKey(new Date()));
  const agenda = useAgenda(mineOnly);
  const { tasks, meetings } = agenda[tab];
  const me = members.find((m) => m.id === currentMemberId);
  const contactName = (id?: string) => contacts.find((c) => c.id === id)?.name;

  const taskLink = (t: Task) => (t.recordId ? null : t.contactId ? `/contacts/${t.contactId}` : null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await addTask({ title: title.trim(), dueDate: due || undefined, assignee: me?.name });
    setTitle("");
    setAdding(false);
  }

  return (
    <Panel
      onClose={onClose}
      title={
        <>
          <span className="font-semibold">סדר יום</span>
          <button onClick={() => setAdding((v) => !v)} className="ms-2 text-xs px-2 py-1 rounded-md bg-emerald-600 text-white">
            + חדש
          </button>
        </>
      }
    >
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 px-2">
        {TABS.map((t) => {
          const n = agenda[t.id].tasks.length + agenda[t.id].meetings.length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t.id ? "border-neutral-900 dark:border-white font-medium" : "border-transparent text-neutral-500"}`}
            >
              {t.label}
              {n > 0 && <span className={`ms-1 text-[11px] ${t.id === "overdue" ? "text-red-500" : "text-neutral-400"}`}>{n}</span>}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-500">
        <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
        רק שלי
      </label>
      {adding && (
        <form onSubmit={add} className="px-4 pb-3 flex gap-2">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="משימה חדשה…" className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="px-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <button type="submit" className="px-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
      )}
      {tasks.length === 0 && meetings.length === 0 ? (
        <div className="text-center py-16 text-neutral-400">
          <p className="text-3xl mb-2">☕</p>
          <p className="text-sm">{tab === "overdue" ? "אין משימות באיחור" : "לא נמצאו משימות או פגישות"}</p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {meetings.map((a) => (
            <li key={a.id} className="px-4 py-2.5 flex gap-3 text-sm">
              <span className="text-xs text-sky-600 font-medium w-12 shrink-0 pt-0.5">{timeOf(a.startAt)}</span>
              <div className="min-w-0">
                <p className="truncate">📅 {a.title}</p>
                {a.contactId && (
                  <Link href={`/contacts/${a.contactId}`} onClick={onClose} className="text-xs text-neutral-500 hover:underline">
                    ליד: {contactName(a.contactId) ?? "פתיחה"}
                  </Link>
                )}
                {tab === "week" && <p className="text-[11px] text-neutral-400">{new Date(a.startAt).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" })}</p>}
              </div>
            </li>
          ))}
          {tasks.map((t) => {
            const href = taskLink(t);
            return (
              <li key={t.id} className="px-4 py-2.5 flex gap-3 text-sm items-start">
                <input type="checkbox" onChange={() => toggleTask(t.id)} className="mt-1 shrink-0" title="סימון כבוצע" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.title}</p>
                  <p className="text-xs text-neutral-500 flex gap-2">
                    {href && (
                      <Link href={href} onClick={onClose} className="hover:underline truncate">
                        ליד: {contactName(t.contactId) ?? "פתיחה"}
                      </Link>
                    )}
                    {!mineOnly && t.assignee && <span>· {t.assignee}</span>}
                  </p>
                </div>
                {(tab === "week" || tab === "overdue") && t.dueDate && (
                  <span className={`text-[11px] shrink-0 ${tab === "overdue" ? "text-red-500" : "text-neutral-400"}`}>{new Date(t.dueDate).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-900">
        <Link href="/tasks" onClick={onClose} className="text-xs text-neutral-500 hover:underline">
          כל המשימות ←
        </Link>
      </div>
    </Panel>
  );
}

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useStore();
  const unread = notifications.filter((n) => !n.read).length;
  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  return (
    <Panel
      onClose={onClose}
      title={
        <>
          <span className="font-semibold">התראות</span>
          {unread > 0 && (
            <button onClick={markAllNotificationsRead} className="ms-2 text-xs text-neutral-500 hover:underline">
              סימון הכל כנקרא ({unread})
            </button>
          )}
        </>
      }
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-400 p-6 text-center">אין התראות.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {sorted.map((n) => {
            const href = n.url ?? (n.contactId ? `/contacts/${n.contactId}` : null);
            const body = (
              <>
                <p className="text-sm">{n.text}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{new Date(n.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</p>
              </>
            );
            return (
              <li key={n.id} className={`px-4 py-2.5 ${n.read ? "opacity-60" : "bg-sky-50/60 dark:bg-sky-950/20"}`}>
                {href ? (
                  <Link href={href} onClick={() => (markNotificationRead(n.id), onClose())} className="block hover:underline">
                    {body}
                  </Link>
                ) : (
                  <button onClick={() => markNotificationRead(n.id)} className="block text-start w-full">
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// Agenda + notifications buttons (top bar on desktop, header on phones).
export function TopBarButtons() {
  const { notifications } = useStore();
  const [open, setOpen] = useState<"agenda" | "notifications" | null>(null);
  const agenda = useAgenda(true);
  const todayCount = agenda.today.tasks.length + agenda.today.meetings.length;
  const overdue = agenda.overdue.tasks.length;
  const unread = notifications.filter((n) => !n.read).length;
  const btn = "relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 text-lg";
  const badge = (n: number, red: boolean) =>
    n > 0 && (
      <span className={`absolute -top-0.5 -end-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] leading-[1.1rem] text-center text-white ${red ? "bg-red-500" : "bg-sky-600"}`}>
        {n > 99 ? "99+" : n}
      </span>
    );
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setOpen("agenda")} className={btn} title="סדר יום" aria-label="סדר יום">
        🕐{badge(overdue || todayCount, overdue > 0)}
      </button>
      <button onClick={() => setOpen("notifications")} className={btn} title="התראות" aria-label="התראות">
        🔔{badge(unread, true)}
      </button>
      {open === "agenda" && <AgendaPanel onClose={() => setOpen(null)} />}
      {open === "notifications" && <NotificationsPanel onClose={() => setOpen(null)} />}
    </div>
  );
}
