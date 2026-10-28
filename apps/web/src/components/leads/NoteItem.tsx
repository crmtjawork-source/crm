"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Activity } from "@/lib/types";

// One entry of the lead's history. A note can be edited or deleted; system
// entries (stage moves…) are read-only.
export function NoteItem({ activity, className = "" }: { activity: Activity; className?: string }) {
  const { updateNote, deleteNote } = useStore();
  const isNote = activity.type === "note";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(activity.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateNote(activity.id, text.trim());
      setEditing(false);
    } catch {
      setError("השמירה נכשלה");
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm("למחוק את ההערה?")) return;
    try {
      await deleteNote(activity.id);
    } catch {
      setError("המחיקה נכשלה");
    }
  }

  if (editing)
    return (
      <li className={`text-sm rounded-lg px-3 py-2 border border-neutral-300 dark:border-neutral-700 ${className}`}>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4} dir="auto" className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent resize-y" />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <div className="flex items-center gap-3 mt-2 text-xs">
          <button onClick={save} disabled={!text.trim() || busy} className="px-3 py-1 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-40">
            {busy ? "שומר…" : "שמירה"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setText(activity.text);
            }}
            className="text-neutral-500 hover:underline"
          >
            ביטול
          </button>
        </div>
      </li>
    );

  return (
    <li className={`group text-sm rounded-lg px-3 py-2 ${isNote ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40" : "text-neutral-500"} ${className}`}>
      <p className="whitespace-pre-line break-words">{activity.text}</p>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-[11px] text-neutral-400">{new Date(activity.createdAt).toLocaleString("he-IL")}</span>
        {isNote && (
          <span className="ms-auto flex gap-3 text-[11px] text-neutral-400 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
            <button onClick={() => setEditing(true)} className="hover:text-neutral-800 dark:hover:text-neutral-200 hover:underline">
              עריכה
            </button>
            <button onClick={remove} className="hover:text-red-500 hover:underline">
              מחיקה
            </button>
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </li>
  );
}
