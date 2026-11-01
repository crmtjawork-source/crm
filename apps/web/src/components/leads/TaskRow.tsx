"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { WhatsAppSheet } from "./WhatsAppSheet";

// A task line; tasks that carry a message (meeting reminders) get a
// "send on WhatsApp" button that marks the task done once opened.
export function TaskRow({ task, showContact = true }: { task: Task; showContact?: boolean }) {
  const { contacts, appointments, members, toggleTask, updateTask, deleteTask } = useStore();
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<{ title: string; dueDate: string; dueTime: string; assignee: string; contactId: string } | null>(null);
  const contact = task.contactId ? contacts.find((c) => c.id === task.contactId) : undefined;
  const appointment = task.appointmentId ? appointments.find((a) => a.id === task.appointmentId) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !task.done && task.dueDate && task.dueDate < today;

  async function save() {
    if (!draft || !draft.title.trim()) return;
    await updateTask(task.id, {
      title: draft.title.trim(),
      dueDate: draft.dueDate || null,
      dueTime: draft.dueDate && draft.dueTime ? draft.dueTime : null,
      assignee: draft.assignee || null,
      contactId: draft.contactId || null,
    });
    setDraft(null);
  }

  if (draft) {
    const field = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";
    return (
      <li className="py-2 space-y-2 text-sm">
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus className={field} placeholder="משימה" />
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="block text-xs text-neutral-500 mb-0.5">תאריך יעד</span>
            <input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} className={field} />
          </label>
          <label>
            <span className="block text-xs text-neutral-500 mb-0.5">שעה</span>
            <input type="time" value={draft.dueTime} disabled={!draft.dueDate} onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} className={field} />
          </label>
          <label>
            <span className="block text-xs text-neutral-500 mb-0.5">אחראי</span>
            <select value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} className={field}>
              <option value="">ללא</option>
              {members.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
              {draft.assignee && !members.some((m) => m.name === draft.assignee) && <option value={draft.assignee}>{draft.assignee}</option>}
            </select>
          </label>
          <label>
            <span className="block text-xs text-neutral-500 mb-0.5">ליד</span>
            <select value={draft.contactId} onChange={(e) => setDraft({ ...draft, contactId: e.target.value })} className={field}>
              <option value="">—</option>
              {contact && <option value={contact.id}>{contact.name}</option>}
              {contacts.slice(0, 2000).filter((c) => c.id !== contact?.id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            שמירה
          </button>
          <button onClick={() => setDraft(null)} className="px-3 py-1.5 text-sm text-neutral-500">
            ביטול
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 text-sm py-1.5">
      <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={task.done ? "line-through text-neutral-400" : ""}>{task.title}</p>
        <p className="text-xs text-neutral-400">
          {task.dueDate && <span className={overdue ? "text-red-500" : ""}>{new Date(task.dueDate).toLocaleDateString("he-IL")}{task.dueTime ? ` · ${task.dueTime}` : ""}</span>}
          {task.assignee && ` · ${task.assignee}`}
          {showContact && contact && (
            <>
              {" · "}
              <Link href={`/contacts/${contact.id}`} className="hover:underline">
                {contact.name}
              </Link>
            </>
          )}
        </p>
      </div>
      {task.templateId && contact && !task.done && (
        <button onClick={() => setSending(true)} className="text-xs px-2 py-1 rounded-md bg-emerald-600 text-white shrink-0">
          שליחה
        </button>
      )}
      <button
        onClick={() => setDraft({ title: task.title, dueDate: task.dueDate ?? "", dueTime: task.dueTime ?? "", assignee: task.assignee ?? "", contactId: task.contactId ?? "" })}
        className="text-xs text-neutral-300 hover:text-neutral-700 dark:hover:text-neutral-200 shrink-0"
        aria-label="עריכה"
        title="עריכת המשימה"
      >
        ✎
      </button>
      <button onClick={() => deleteTask(task.id)} className="text-xs text-neutral-300 hover:text-red-500 shrink-0" aria-label="מחיקה">
        ×
      </button>
      {sending && contact && (
        <WhatsAppSheet
          contact={contact}
          appointment={appointment}
          templateId={task.templateId}
          onClose={() => setSending(false)}
          onOpened={() => toggleTask(task.id)}
        />
      )}
    </li>
  );
}
