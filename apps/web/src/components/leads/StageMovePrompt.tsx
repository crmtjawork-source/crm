"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { STAGE_FOR, useLeadActions } from "./useLeadActions";

type Kind = keyof typeof STAGE_FOR;
type Prompt = { key: number; contact: Contact; kind: Kind };

// Moving a lead on the pipeline (board or table) into a stage that has a
// lead-card action does what that button does: opens the meeting form, or
// logs "no answer" / sends the after-meeting message automatically.
export function useStageMovePrompt() {
  const { opportunities, contacts, pipelines } = useStore();
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  function afterMove(oppId: string, toStageId: string) {
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || opp.stageId === toStageId) return;
    const stageName = pipelines.find((p) => p.id === opp.pipelineId)?.stages.find((st) => st.id === toStageId)?.name ?? "";
    const kind = (Object.keys(STAGE_FOR) as Kind[]).find((k) => stageName.includes(STAGE_FOR[k]));
    const contact = contacts.find((c) => c.id === opp.contactId);
    if (kind && contact) setPrompt({ key: Date.now(), contact, kind });
  }

  const element = prompt ? <StageMovePrompt key={prompt.key} contact={prompt.contact} kind={prompt.kind} onClose={() => setPrompt(null)} /> : null;
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
