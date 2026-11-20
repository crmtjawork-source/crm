"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import { CALL_OUTCOMES, announceCallsChanged, type CallOutcome } from "@/lib/calls";
import type { Contact } from "@/lib/types";
import { useLeadActions } from "@/components/leads/useLeadActions";
import type { PendingCall } from "./CallProvider";

const FOLLOW_UPS = [
  { id: "none", label: "ללא" },
  { id: "1", label: "מחר" },
  { id: "3", label: "בעוד 3 ימים" },
  { id: "7", label: "בעוד שבוע" },
  { id: "date", label: "תאריך…" },
] as const;

const isoDay = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const field = "w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent";
const chip = (on: boolean) =>
  `px-3 min-h-9 rounded-full text-sm border transition-colors duration-150 ${on ? "bg-tint text-white border-transparent" : "border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300"}`;

// The form that opens when the agent comes back from a call: how it went, a
// note, and (optionally) a follow-up task. Saves onto the call's log row.
export function AfterCallFlow({ contact, pending, onDone, onCancel, onLater }: { contact: Contact; pending: PendingCall; onDone: () => void; onCancel: () => void; onLater: () => void }) {
  const { orgId, addTask, members, currentMemberId } = useStore();
  const lead = useLeadActions(contact);
  const me = members.find((m) => m.id === currentMemberId);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState("");
  const [follow, setFollow] = useState<(typeof FOLLOW_UPS)[number]["id"]>("none");
  const [date, setDate] = useState(isoDay(1));
  const [title, setTitle] = useState(`שיחת מעקב — ${contact.name}`);
  const [markNoAnswer, setMarkNoAnswer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"form" | "after">("form");

  // Once the form is saved, the lead's own "no answer" flow may still show its
  // message composer: stay mounted until it has nothing left to show.
  useEffect(() => {
    if (phase !== "after" || lead.busy) return;
    const t = window.setTimeout(onDone, lead.notice ? 3500 : 0);
    return () => window.clearTimeout(t);
  }, [phase, lead.busy, lead.notice, onDone]);

  const dueDate = follow === "none" ? undefined : follow === "date" ? date : isoDay(Number(follow));

  async function save() {
    if (!outcome || busy) return;
    setBusy(true);
    setError("");
    try {
      const picked = CALL_OUTCOMES.find((o) => o.id === outcome)!;
      let taskId: string | undefined;
      if (dueDate) {
        const task = await addTask({ title: title.trim() || `שיחת מעקב — ${contact.name}`, contactId: contact.id, assignee: me?.name, dueDate });
        taskId = task.id;
      }
      const secs = Number(minutes) > 0 ? Math.round(Number(minutes) * 60) : undefined;
      const result = {
        outcome,
        status: picked.status,
        notes: note.trim() || null,
        ended_at: new Date().toISOString(),
        after_call_done: true,
        ...(secs ? { duration_seconds: secs } : {}),
        ...(taskId ? { task_id: taskId } : {}),
      };
      if (pending.callId) {
        const { error: e } = await supabase.from("calls").update(result).eq("id", pending.callId);
        if (e) throw e;
      } else {
        // The log row never landed (offline, or a hiccup): record the call now.
        const { data: auth } = await supabase.auth.getUser();
        const { error: e } = await supabase.from("calls").insert({
          org_id: orgId,
          contact_id: contact.id,
          direction: "outbound",
          to_number: contact.phone,
          agent_user_id: auth.user?.id,
          agent_email: auth.user?.email ?? null,
          agent_name: me?.name ?? null,
          started_at: new Date(pending.startedAt).toISOString(),
          source: "manual",
          ...result,
        });
        if (e) throw e;
      }
      announceCallsChanged();
      if (outcome === "no_answer" && markNoAnswer) await lead.noAnswer();
      setPhase("after");
    } catch {
      setError("השמירה נכשלה — אפשר לנסות שוב");
      setBusy(false);
    }
  }

  if (phase === "after") {
    return (
      <>
        {lead.overlays}
        {lead.notice && (
          <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-3 pointer-events-none">
            <p className={`rounded-full bg-neutral-900 text-white text-sm px-4 py-2 shadow-lg ${lead.notice.ok ? "" : "ring-2 ring-amber-400"}`}>{lead.notice.text}</p>
          </div>
        )}
      </>
    );
  }

  return (
    <Sheet title={`איך הייתה השיחה עם ${contact.name}?`} onClose={onLater}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="תוצאת השיחה">
          {CALL_OUTCOMES.map((o) => (
            <button key={o.id} role="radio" aria-checked={outcome === o.id} onClick={() => setOutcome(o.id)} className={chip(outcome === o.id)}>
              {o.label}
            </button>
          ))}
        </div>

        {outcome === "no_answer" && (
          <label className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input type="checkbox" checked={markNoAnswer} onChange={(e) => setMarkNoAnswer(e.target.checked)} className="mt-1" />
            <span>כמו הכפתור &quot;ללא מענה&quot;: מעדכן את הסטטוס ומציע/שולח את ההודעה</span>
          </label>
        )}

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} dir="auto" placeholder="הערה על השיחה (לא חובה)" className={`${field} resize-y`} />

        <div>
          <p className="text-xs font-semibold text-neutral-500 mb-1.5">משימת המשך</p>
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UPS.map((f) => (
              <button key={f.id} onClick={() => setFollow(f.id)} aria-pressed={follow === f.id} className={chip(follow === f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {follow !== "none" && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} aria-label="כותרת המשימה" />
              {follow === "date" && <input type="date" value={date} min={isoDay(0)} onChange={(e) => setDate(e.target.value)} className={field} aria-label="תאריך" />}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          משך השיחה בדקות
          <input type="number" min={0} max={600} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${field} !w-20`} dir="ltr" />
          <span className="text-xs text-neutral-400">(לא חובה)</span>
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!outcome || busy} className="flex-1 min-h-10 rounded-lg bg-tint text-white font-semibold disabled:opacity-40">
            {busy ? "שומר…" : "שמירה"}
          </button>
          <button onClick={onCancel} className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
            לא התקשרתי
          </button>
        </div>
      </div>
    </Sheet>
  );
}
