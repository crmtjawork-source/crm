"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { ArrowRightLeft, ImagePlus, PhoneIncoming, PhoneOutgoing, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Segmented } from "@/components/ui/Segmented";
import { NoteItem } from "./NoteItem";
import { joinNote, NOTE_IMAGE_MAX, uploadNoteImage } from "@/lib/noteImages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallRow = Record<string, any>;
const CALL_STATUS: Record<string, string> = { answered: "נענתה", no_answer: "לא נענתה", busy: "תפוס", cancelled: "בוטלה", failed: "לא מחובר" };
const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
type Filter = "all" | "notes" | "calls";

// A line of the timeline for something that is not a note (stage move, phone call).
function TimelineRow({ icon: Icon, color, title, detail, at }: { icon: LucideIcon; color: string; title: string; detail?: string; at: string }) {
  return (
    <li className="flex gap-3 text-sm">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: color }}>
        <Icon size={14} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="leading-snug">{title}</p>
        {detail && <p className="text-xs text-neutral-500 line-clamp-2">{detail}</p>}
        <p className="text-[11px] text-neutral-400 mt-0.5">{new Date(at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</p>
      </div>
    </li>
  );
}

// The lead's notes and history as a side panel (wide screens) and as a block on the phone: write a note
// at the top, read everything below — notes only, or notes with the system
// activity (stage moves, messages sent…).
export function LeadNotesPanel({ contact }: { contact: Contact }) {
  const { activitiesFor, addNote, orgId } = useStore();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("notes");
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState("");
  const previews = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  useEffect(() => {
    let alive = true;
    supabase
      .from("calls")
      .select("*")
      .eq("contact_id", contact.id)
      .order("started_at", { ascending: false })
      .limit(100)
      .then(({ data }) => alive && setCalls(data ?? []));
    return () => {
      alive = false;
    };
  }, [contact.id]);
  const all = activitiesFor(contact.id);
  const notes = all.filter((a) => a.type === "note");
  // One timeline: notes, stage moves and phone calls, newest first.
  type Entry = { at: string; key: string; node: React.ReactNode; kind: "note" | "call" | "system" };
  const entries: Entry[] = [
    ...all.map((a): Entry =>
      a.type === "note"
        ? { at: a.createdAt, key: a.id, kind: "note", node: <NoteItem key={a.id} activity={a} /> }
        : { at: a.createdAt, key: a.id, kind: "system", node: <TimelineRow key={a.id} icon={ArrowRightLeft} color="#8e8e93" title={a.text} at={a.createdAt} /> }
    ),
    ...calls.map((c): Entry => {
      const inbound = c.direction === "inbound";
      const answered = c.status === "answered";
      return {
        at: c.started_at,
        key: `call-${c.id}`,
        kind: "call",
        node: (
          <TimelineRow
            key={`call-${c.id}`}
            icon={inbound ? PhoneIncoming : PhoneOutgoing}
            color={answered ? "#30d158" : "#ff9f0a"}
            title={`שיחה ${inbound ? "נכנסת" : "יוצאת"} · ${CALL_STATUS[c.status] ?? c.status}${answered && c.duration_seconds > 0 ? ` · ${mmss(c.duration_seconds)}` : ""}`}
            detail={c.summary}
            at={c.started_at}
          />
        ),
      };
    }),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const list = entries.filter((e) => filter === "all" || (filter === "notes" ? e.kind === "note" : e.kind === "call"));

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if ((!text.trim() && images.length === 0) || busy) return;
    setBusy(true);
    setError("");
    try {
      const paths = await Promise.all(images.map((f) => uploadNoteImage(orgId, f)));
      await addNote(contact.id, joinNote(text, paths));
      setText("");
      setImages([]);
    } catch {
      setError("העלאת התמונה נכשלה");
    }
    setBusy(false);
  }

  function pick(files: File[]) {
    const ok = files.filter((f) => f.type.startsWith("image/"));
    if (ok.some((f) => f.size > NOTE_IMAGE_MAX)) setError("תמונה גדולה מ-10MB לא נוספה");
    setImages((xs) => [...xs, ...ok.filter((f) => f.size <= NOTE_IMAGE_MAX)]);
  }

  return (
    <aside className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm flex flex-col lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)]">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-900">
        <h2 className="text-sm font-semibold flex-1">ציר זמן</h2>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all" as Filter, label: `הכל (${entries.length})` },
            { id: "notes" as Filter, label: `הערות (${notes.length})` },
            { id: "calls" as Filter, label: `שיחות (${calls.length})` },
          ]}
        />
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
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.some((f) => f.type.startsWith("image/"))) {
              e.preventDefault();
              pick(files);
            }
          }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent resize-y"
        />
        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {previews.map((u, i) => (
              <div key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-16 w-16 rounded-md object-cover border border-neutral-200 dark:border-neutral-800" />
                <button type="button" onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))} aria-label="הסרת תמונה" className="absolute -top-1.5 -end-1.5 h-5 w-5 rounded-full bg-neutral-900 text-white text-xs leading-none">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <label className="mt-2 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 cursor-pointer text-neutral-600 dark:text-neutral-300">
          <ImagePlus size={14} aria-hidden />
          הוספת תמונה
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (pick(Array.from(e.target.files ?? [])), (e.target.value = ""))} />
        </label>
        <button type="submit" disabled={(!text.trim() && images.length === 0) || busy} className="mt-2 w-full py-1.5 text-sm rounded-md bg-tint text-white disabled:opacity-40">
          {busy ? "שומר…" : "הוספת הערה"}
        </button>
      </form>
      <ul className="overflow-y-auto p-3 space-y-3 min-h-24 max-h-[60dvh] lg:max-h-none">
        {list.length === 0 && <li className="text-sm text-neutral-400">{filter === "notes" ? "אין עדיין הערות." : filter === "calls" ? "אין עדיין שיחות." : "אין עדיין פעילות."}</li>}
        {list.map((e) => e.node)}
      </ul>
    </aside>
  );
}
