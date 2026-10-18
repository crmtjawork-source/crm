"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { TaskRow } from "@/components/leads/TaskRow";
import type { Task } from "@/lib/types";

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function TasksPage() {
  const { tasks, contacts, members, currentMemberId, addTask } = useStore();
  const myName = members.find((m) => m.id === currentMemberId)?.name;
  const [mine, setMine] = useState(true);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contactId, setContactId] = useState("");
  const [showDone, setShowDone] = useState(false);

  const today = localDay(new Date());
  const visible = tasks.filter((t) => !mine || !myName || t.assignee === myName);
  const open = visible.filter((t) => !t.done).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const groups: [string, Task[]][] = [
    ["באיחור", open.filter((t) => t.dueDate && t.dueDate < today)],
    ["היום", open.filter((t) => t.dueDate === today)],
    ["הבאות", open.filter((t) => t.dueDate && t.dueDate > today)],
    ["ללא תאריך", open.filter((t) => !t.dueDate)],
  ];
  const done = visible.filter((t) => t.done);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({ title: title.trim(), dueDate: dueDate || undefined, contactId: contactId || undefined, assignee: myName });
    setTitle("");
    setDueDate("");
    setContactId("");
  }

  const field = "w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">משימות</h1>
        <div className="flex text-xs rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {[
            [true, "שלי"],
            [false, "של כולם"],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              onClick={() => setMine(value as boolean)}
              className={`px-3 py-1.5 ${mine === value ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 md:flex md:flex-wrap items-end gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
        <label className="text-sm col-span-2 md:flex-1 md:min-w-40">
          <span className="block text-xs text-neutral-500 mb-1">משימה</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500 mb-1">תאריך יעד</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500 mb-1">ליד (לא חובה)</span>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={field}>
            <option value="">—</option>
            {contacts.slice(0, 2000).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="col-span-2 md:col-span-1 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          הוספה
        </button>
      </form>

      {open.length === 0 && <p className="text-sm text-neutral-400 mb-6">אין משימות פתוחות.</p>}
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <section key={label} className="mb-6">
            <h2 className={`text-sm font-semibold mb-1 ${label === "באיחור" ? "text-red-500" : "text-neutral-500"}`}>
              {label} ({list.length})
            </h2>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3">
              {list.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          </section>
        ))}

      {done.length > 0 && (
        <section>
          <button onClick={() => setShowDone((v) => !v)} className="text-sm font-semibold text-neutral-500 mb-1 hover:underline">
            הושלמו ({done.length}) {showDone ? "▴" : "▾"}
          </button>
          {showDone && (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3">
              {done.slice(0, 200).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
