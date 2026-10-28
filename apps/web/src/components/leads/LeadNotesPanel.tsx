"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";

// The lead's notes and history as a side panel (wide screens): write a note
// at the top, read everything below — notes only, or notes with the system
// activity (stage moves, messages sent…).
export function LeadNotesPanel({ contact }: { contact: Contact }) {
  const { activitiesFor, addNote } = useStore();
  const [text, setText] = useState("");
  const [onlyNotes, setOnlyNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = activitiesFor(contact.id);
  const notes = all.filter((a) => a.type === "note");
  const list = onlyNotes ? notes : all;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    await addNote(contact.id, text.trim());
    setText("");
    setBusy(false);
  }

  return (
    <aside className="border border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-col lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)]">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-900">
        <h2 className="text-sm font-semibold flex-1">הערות והיסטוריה</h2>
        <div className="flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs">
          <button onClick={() => setOnlyNotes(true)} className={`px-2.5 py-1 ${onlyNotes ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>
            הערות ({notes.length})
          </button>
          <button onClick={() => setOnlyNotes(false)} className={`px-2.5 py-1 ${!onlyNotes ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>
            הכל ({all.length})
          </button>
        </div>
      </div>
      <form onSubmit={submit} className="p-3 border-b border-neutral-100 dark:border-neutral-900">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          rows={3}
          dir="auto"
          placeholder="כתיבת הערה… (Ctrl + Enter לשמירה)"
          className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent resize-y"
        />
        <button type="submit" disabled={!text.trim() || busy} className="mt-2 w-full py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-40">
          {busy ? "שומר…" : "הוספת הערה"}
        </button>
      </form>
      <ul className="overflow-y-auto p-3 space-y-3 min-h-24">
        {list.length === 0 && <li className="text-sm text-neutral-400">{onlyNotes ? "אין עדיין הערות." : "אין עדיין פעילות."}</li>}
        {list.map((a) => (
          <li key={a.id} className={`text-sm rounded-lg px-3 py-2 ${a.type === "note" ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40" : "text-neutral-500"}`}>
            <p className="whitespace-pre-line break-words">{a.text}</p>
            <p className="text-[11px] text-neutral-400 mt-1">{new Date(a.createdAt).toLocaleString("he-IL")}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
