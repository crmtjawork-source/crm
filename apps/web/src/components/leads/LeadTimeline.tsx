"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { NoteItem } from "./NoteItem";

// The lead's history. On the card it's one line (add a note + the latest
// entry); the full timeline opens in a window so the card stays short.
export function LeadTimeline({ contact }: { contact: Contact }) {
  const { activitiesFor, addNote } = useStore();
  const [open, setOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const activities = activitiesFor(contact.id);
  const latest = activities[0];

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await addNote(contact.id, noteText.trim());
    setNoteText("");
  }

  const noteForm = (autoFocus = false) => (
    <form onSubmit={handleAddNote} className="flex gap-2 mb-4">
      <input
        autoFocus={autoFocus}
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="הוספת הערה…"
        className="flex-1 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
      />
      <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
        הוספה
      </button>
    </form>
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-neutral-500">ציר זמן</h2>
        {activities.length > 0 && (
          <button onClick={() => setOpen(true)} className="text-xs text-neutral-500 hover:underline">
            הצגת הכל ({activities.length}) ‹
          </button>
        )}
      </div>
      {noteForm()}
      {latest ? (
        <button onClick={() => setOpen(true)} className="w-full text-start text-sm flex gap-2 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
          <span>{latest.type === "note" ? "📝" : "→"}</span>
          <span className="min-w-0 truncate">{latest.text.split("\n")[0]}</span>
          <span className="text-xs text-neutral-400 shrink-0 mt-0.5">{new Date(latest.createdAt).toLocaleDateString("he-IL")}</span>
        </button>
      ) : (
        <p className="text-sm text-neutral-400">אין עדיין פעילות.</p>
      )}
      {open && (
        <Sheet title={`ציר זמן — ${contact.name}`} onClose={() => setOpen(false)} wide>
          {noteForm()}
          <ul className="space-y-3">
            {activities.map((a) => (
              <NoteItem key={a.id} activity={a} />
            ))}
          </ul>
        </Sheet>
      )}
    </section>
  );
}
