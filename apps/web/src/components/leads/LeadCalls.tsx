"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const STATUS: Record<string, string> = { answered: "נענתה", no_answer: "לא נענתה", busy: "תפוס", cancelled: "בוטלה", failed: "לא מחובר" };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const fetchCalls = async (column: "contact_id" | "record_id", id: string) =>
  (await supabase.from("calls").select("*").eq(column, id).order("started_at", { ascending: false }).limit(200)).data ?? [];

// Phone calls with a lead (or a record): outcome, length, summary, transcript.
export function LeadCalls({ contactId, recordId }: { contactId?: string; recordId?: string }) {
  const [calls, setCalls] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (contactId) fetchCalls("contact_id", contactId).then(setCalls);
    else if (recordId) fetchCalls("record_id", recordId).then(setCalls);
  }, [contactId, recordId]);

  if (!calls.length) return null;
  const answered = calls.filter((c) => c.status === "answered").length;
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-neutral-500 mb-2">
        שיחות טלפון <span className="font-normal text-neutral-400">({calls.length}, {answered} נענו)</span>
      </h2>
      <ul className="space-y-1.5">
        {calls.map((c) => {
          const expanded = open === c.id;
          const detail = c.summary || c.transcript?.length;
          return (
            <li key={c.id} className="border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm">
              <button onClick={() => detail && setOpen(expanded ? null : c.id)} className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-start">
                <span>{c.direction === "inbound" ? "📥" : "📤"}</span>
                <span className={c.status === "answered" ? "" : "text-neutral-400"}>
                  {c.direction === "inbound" ? "נכנסת" : "יוצאת"} · {STATUS[c.status] ?? c.status}
                </span>
                {c.status === "answered" && c.duration_seconds > 0 && <span className="text-neutral-500">{mmss(c.duration_seconds)}</span>}
                {c.agent_name && <span className="text-neutral-500">· {c.agent_name}</span>}
                <span className="text-xs text-neutral-400 ms-auto">{new Date(c.started_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
                {c.summary && <span className="basis-full text-xs text-neutral-600 dark:text-neutral-400 line-clamp-1">{c.summary}</span>}
              </button>
              {expanded && (
                <div className="px-3 pb-3 space-y-2 text-xs">
                  {c.summary && <p className="leading-relaxed bg-neutral-50 dark:bg-neutral-900 rounded p-2">🧠 {c.summary}</p>}
                  {c.recording_url && (
                    <a href={c.recording_url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                      🎧 הקלטה (נפתחת במערכת המרכזייה)
                    </a>
                  )}
                  {c.transcript?.length > 0 && (
                    <div className="space-y-1 max-h-64 overflow-y-auto border-t border-neutral-100 dark:border-neutral-900 pt-2">
                      {c.transcript.map((t: Row, i: number) => (
                        <p key={i}>
                          <span className="text-neutral-400">{t.speaker === "Speaker0" ? "נציג" : t.speaker === "Speaker1" ? "ליד" : t.speaker}: </span>
                          {t.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
