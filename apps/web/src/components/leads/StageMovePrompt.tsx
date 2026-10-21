"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { STAGE_FOR, useLeadActions } from "./useLeadActions";

type Kind = keyof typeof STAGE_FOR;
type Prompt = { key: number; contact: Contact; kind: Kind };

// Moving a lead on the pipeline (board or table) into a stage that has a
// lead-card action opens that action's window: the meeting form, or an offer
// to log "no answer" / send the after-meeting message.
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

const ASK: Record<Exclude<Kind, "meeting">, { title: string; text: string; yes: string; no: string }> = {
  noAnswer: {
    title: "ללא מענה",
    text: "לרשום ניסיון ללא מענה? תירשם הערה, תיווצר משימה לחייג שוב מחר, הסטטוס יתעדכן והודעת \"ללא מענה\" תישלח — בדיוק כמו בכפתור שבכרטיס הליד.",
    yes: "כן, לרשום ולשלוח",
    no: "רק להעביר שלב",
  },
  afterMeeting: {
    title: "אחרי פגישה",
    text: "לשלוח עכשיו את הודעת \"אחרי פגישה\" — בדיוק כמו בכפתור שבכרטיס הליד?",
    yes: "שליחה",
    no: "לא עכשיו",
  },
};

function StageMovePrompt({ contact, kind, onClose }: { contact: Contact; kind: Kind; onClose: () => void }) {
  const { noAnswer, afterMeeting, notice, overlays } = useLeadActions(contact, { openMeeting: kind === "meeting" });
  const [asking, setAsking] = useState(kind !== "meeting");

  async function confirm() {
    setAsking(false);
    if (kind === "noAnswer") await noAnswer({ moved: true });
    if (kind === "afterMeeting") await afterMeeting({ moved: true });
  }

  const ask = kind !== "meeting" ? ASK[kind] : null;
  return (
    <>
      {asking && ask && (
        <Sheet title={`${ask.title} — ${contact.name}`} onClose={onClose}>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed mb-4">{ask.text}</p>
          <div className="flex gap-2">
            <button onClick={confirm} className="flex-1 py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium">
              {ask.yes}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
              {ask.no}
            </button>
          </div>
        </Sheet>
      )}
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
