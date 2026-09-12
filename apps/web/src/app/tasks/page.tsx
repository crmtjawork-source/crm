"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

export default function TasksPage() {
  const { tasks, contacts, addTask, toggleTask, deleteTask } = useStore();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contactId, setContactId] = useState("");

  const open = tasks.filter((t) => !t.done).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const done = tasks.filter((t) => t.done);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      dueDate: dueDate || undefined,
      contactId: contactId || undefined,
      assignee: "אתה",
    });
    setTitle("");
    setDueDate("");
    setContactId("");
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">משימות</h1>

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
        <label className="text-sm flex-1 min-w-40">
          <span className="block text-xs text-neutral-500 mb-1">משימה</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500 mb-1">תאריך יעד</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500 mb-1">ליד (אופציונלי)</span>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          הוספה
        </button>
      </form>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">פתוחות ({open.length})</h2>
        <ul className="space-y-2">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} contactName={contacts.find((c) => c.id === t.contactId)?.name} onToggle={() => toggleTask(t.id)} onDelete={() => deleteTask(t.id)} />
          ))}
          {open.length === 0 && <p className="text-sm text-neutral-400">אין משימות פתוחות.</p>}
        </ul>
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-neutral-500 mb-2">הושלמו ({done.length})</h2>
          <ul className="space-y-2">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} contactName={contacts.find((c) => c.id === t.contactId)?.name} onToggle={() => toggleTask(t.id)} onDelete={() => deleteTask(t.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TaskRow({
  task,
  contactName,
  onToggle,
  onDelete,
}: {
  task: { id: string; title: string; dueDate?: string; done: boolean; contactId?: string };
  contactName?: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const overdue = !task.done && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <li className="flex items-center gap-3 border border-neutral-200 dark:border-neutral-800 rounded-md px-3 py-2 text-sm">
      <input type="checkbox" checked={task.done} onChange={onToggle} className="shrink-0" />
      <div className={`flex-1 ${task.done ? "line-through text-neutral-400" : ""}`}>
        {task.title}
        {task.contactId && contactName && (
          <>
            {" · "}
            <Link href={`/contacts/${task.contactId}`} className="hover:underline">
              {contactName}
            </Link>
          </>
        )}
      </div>
      {task.dueDate && (
        <span className={`text-xs shrink-0 ${overdue ? "text-red-500" : "text-neutral-400"}`}>{task.dueDate}</span>
      )}
      <button onClick={onDelete} className="text-neutral-300 hover:text-red-500 shrink-0">
        ×
      </button>
    </li>
  );
}
