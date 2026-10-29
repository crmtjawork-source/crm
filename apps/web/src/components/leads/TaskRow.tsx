"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { WhatsAppSheet } from "./WhatsAppSheet";

// A task line; tasks that carry a message (meeting reminders) get a
// "send on WhatsApp" button that marks the task done once opened.
export function TaskRow({ task, showContact = true }: { task: Task; showContact?: boolean }) {
  const { contacts, appointments, toggleTask, deleteTask } = useStore();
  const [sending, setSending] = useState(false);
  const contact = task.contactId ? contacts.find((c) => c.id === task.contactId) : undefined;
  const appointment = task.appointmentId ? appointments.find((a) => a.id === task.appointmentId) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !task.done && task.dueDate && task.dueDate < today;

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
