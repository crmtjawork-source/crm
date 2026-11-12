"use client";

import { confirmAction } from "@/lib/confirm";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { Activity } from "@/lib/types";
import { joinNote, removeNoteImages, signedImageUrl, splitNote } from "@/lib/noteImages";

function NoteImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedImageUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return <div className="h-24 w-24 rounded-md bg-neutral-100 dark:bg-neutral-800 animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="תמונה בהערה" className="max-h-48 max-w-full rounded-lg border border-neutral-200 dark:border-neutral-800 object-cover" />
    </a>
  );
}

// One entry of the lead's history. A note can be edited or deleted; system
// entries (stage moves…) are read-only.
export function NoteItem({ activity, className = "" }: { activity: Activity; className?: string }) {
  const { updateNote, deleteNote } = useStore();
  const isNote = activity.type === "note";
  const [editing, setEditing] = useState(false);
  const { body, paths } = splitNote(activity.text);
  const [text, setText] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if ((!text.trim() && paths.length === 0) || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateNote(activity.id, joinNote(text, paths));
      setEditing(false);
    } catch {
      setError("השמירה נכשלה");
    }
    setBusy(false);
  }

  async function remove() {
    if (!(await confirmAction("למחוק את ההערה?"))) return;
    try {
      await deleteNote(activity.id);
      void removeNoteImages(paths);
    } catch {
      setError("המחיקה נכשלה");
    }
  }

  if (editing)
    return (
      <li className={`text-sm rounded-lg px-3 py-2 border border-neutral-300 dark:border-neutral-700 ${className}`}>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4} dir="auto" className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent resize-y" />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <div className="flex items-center gap-3 mt-2 text-xs">
          <button onClick={save} disabled={(!text.trim() && paths.length === 0) || busy} className="px-3 py-1 rounded-md bg-tint text-white disabled:opacity-40">
            {busy ? "שומר…" : "שמירה"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setText(body);
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
      {body && <p className="whitespace-pre-line break-words">{body}</p>}
      {paths.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {paths.map((p) => (
            <NoteImage key={p} path={p} />
          ))}
        </div>
      )}
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
