"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact, Opportunity } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { STAGE_FOR, useLeadActions } from "./useLeadActions";

type Kind = keyof typeof STAGE_FOR;
type Prompt = { key: number; contact: Contact; kind: Kind } | { key: number; contact: Contact; kind: "lost"; opp: Opportunity; prevStageId: string };

// Moving a lead on the pipeline (board or table) into a stage that has a
// lead-card action does what that button does: opens the meeting form, or
// logs "no answer" / sends the after-meeting message automatically.
export function useStageMovePrompt() {
  const { opportunities, contacts, pipelines } = useStore();
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  // `fresh`: the deal was just created in that stage (nothing to move back to).
  function afterMove(oppId: string, toStageId: string, fresh = false) {
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || (opp.stageId === toStageId && !fresh)) return;
    const toStage = pipelines.find((p) => p.id === opp.pipelineId)?.stages.find((st) => st.id === toStageId);
    const stageName = toStage?.name ?? "";
    // A stage that asks why the deal wasn't closed.
    if (toStage?.asksLostReason) {
      const lead = contacts.find((c) => c.id === opp.contactId);
      if (lead) setPrompt({ key: Date.now(), contact: lead, kind: "lost", opp, prevStageId: fresh ? "" : opp.stageId });
      return;
    }
    const kind = (Object.keys(STAGE_FOR) as Kind[]).find((k) => stageName.includes(STAGE_FOR[k]));
    const contact = contacts.find((c) => c.id === opp.contactId);
    if (kind && contact) setPrompt({ key: Date.now(), contact, kind });
  }

  const element = !prompt ? null : prompt.kind === "lost" ? (
    <LostReasonSheet key={prompt.key} contact={prompt.contact} opp={prompt.opp} prevStageId={prompt.prevStageId} onClose={() => setPrompt(null)} />
  ) : (
    <StageMovePrompt key={prompt.key} contact={prompt.contact} kind={prompt.kind} onClose={() => setPrompt(null)} />
  );
  return { afterMove, element };
}

function StageMovePrompt({ contact, kind, onClose }: { contact: Contact; kind: Kind; onClose: () => void }) {
  const { noAnswer, afterMeeting, notice, overlays, busy } = useLeadActions(contact, { openMeeting: kind === "meeting" });
  const started = useRef(false);

  // Moving the lead into the stage IS the action: it runs the same steps as
  // the lead-card button, no questions asked (the meeting needs its form).
  useEffect(() => {
    if (started.current || kind === "meeting") return;
    started.current = true;
    if (kind === "noAnswer") void noAnswer({ moved: true });
    else void afterMeeting({ moved: true });
  }, [kind, noAnswer, afterMeeting]);

  // The confirmation fades away on its own unless a window is still open.
  useEffect(() => {
    if (!notice?.ok || busy || notice.text.startsWith("שולח")) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [notice, busy, onClose]);

  return (
    <>
      {overlays}
      {notice && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-lg px-4 py-2.5 text-sm">
            <span className={notice.ok ? "text-emerald-600" : "text-amber-600"}>{notice.text}</span>
            <button onClick={onClose} aria-label="סגירה" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-lg leading-none">
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// "Why wasn't the deal closed?" — pick from the business's own list. Leaving
// without choosing puts the deal back where it was, so a deal never sits in
// the stage with no reason.
function LostReasonSheet({ contact, opp, prevStageId, onClose }: { contact: Contact; opp: Opportunity; prevStageId: string; onClose: () => void }) {
  const { lostReasons, updateOpportunity, addNote, moveOpportunity } = useStore();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!reason || busy) return;
    setBusy(true);
    await updateOpportunity(opp.id, { lostReason: reason });
    await addNote(contact.id, `❌ לא נסגרה עסקה — סיבה: ${reason}`);
    onClose();
  }

  async function cancel() {
    setBusy(true);
    if (prevStageId) await moveOpportunity(opp.id, prevStageId);
    onClose();
  }

  return (
    <Sheet title={`למה לא נסגרה עסקה עם ${contact.name}?`} onClose={cancel}>
      <div className="space-y-2">
        {lostReasons.length === 0 && <p className="text-sm text-neutral-500">עוד לא הוגדרו סיבות. אפשר להוסיף בהגדרות ← שלבי עסקה.</p>}
        {lostReasons.map((r) => (
          <label key={r} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer ${reason === r ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"}`}>
            <input type="radio" name="lost-reason" checked={reason === r} onChange={() => setReason(r)} />
            {r}
          </label>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={!reason || busy} className="flex-1 py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-40">
            {busy ? "שומר…" : "אישור"}
          </button>
          <button onClick={cancel} disabled={busy} className="text-xs text-neutral-500 hover:underline">
            ביטול — להחזיר לשלב הקודם
          </button>
        </div>
      </div>
    </Sheet>
  );
}
