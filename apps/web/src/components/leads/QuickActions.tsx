"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Appointment, Contact } from "@/lib/types";
import { WhatsAppSheet } from "./WhatsAppSheet";
import { MeetingSheet } from "./MeetingSheet";

// Stage each action moves the lead's open deal to, when the pipeline has a
// stage by that name. "No answer" only moves a deal still in the first stage.
const STAGE_FOR = { noAnswer: "ללא מענה", meeting: "נקבעה פגישה", afterMeeting: "בתהליך אחרי פגישה" };

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Composer = { templateId?: string; appointment?: Appointment } | null;

export function QuickActions({ contact }: { contact: Contact }) {
  const { opportunities, pipelines, messageTemplates, members, currentMemberId, moveOpportunity, updateContact, addTask, addNote } = useStore();
  const [composer, setComposer] = useState<Composer>(null);
  const [scheduling, setScheduling] = useState(false);
  const agentName = members.find((m) => m.id === currentMemberId)?.name;
  const templateFor = (action: string) => messageTemplates.find((t) => t.quickAction === action)?.id;

  async function moveTo(stageName: string, onlyFromFirst = false) {
    const opp = opportunities.find((o) => o.contactId === contact.id && o.status === "open");
    const pipeline = opp && pipelines.find((p) => p.id === opp.pipelineId);
    const target = pipeline?.stages.find((s) => s.name === stageName);
    if (!opp || !pipeline || !target || opp.stageId === target.id) return;
    if (onlyFromFirst && pipeline.stages[0]?.id !== opp.stageId) return;
    await moveOpportunity(opp.id, target.id);
  }

  async function noAnswer() {
    const attempt = contact.noAnswerCount + 1;
    await updateContact(contact.id, { noAnswerCount: attempt });
    await addNote(contact.id, `📵 ללא מענה — ניסיון ${attempt}${agentName ? ` (${agentName})` : ""}`);
    await moveTo(STAGE_FOR.noAnswer, true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await addTask({ title: `לחייג שוב ל${contact.name} (ניסיון ${attempt + 1})`, contactId: contact.id, assignee: agentName, dueDate: localDay(tomorrow) });
    setComposer({ templateId: templateFor(`no_answer_${Math.min(attempt, 4)}`) });
  }

  async function afterMeeting() {
    await moveTo(STAGE_FOR.afterMeeting);
    setComposer({ templateId: templateFor("after_meeting") });
  }

  const btn = "flex flex-col items-center justify-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 py-2.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-40";

  return (
    <>
      <div className="grid grid-cols-5 gap-2 mb-5">
        <a href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : undefined} aria-disabled={!contact.phone} className={`${btn} ${contact.phone ? "" : "pointer-events-none opacity-40"}`}>
          <span className="text-lg">📞</span>
          התקשרות
        </a>
        <button onClick={() => setComposer({})} disabled={!contact.phone} className={btn}>
          <span className="text-lg">💬</span>
          וואטסאפ
        </button>
        <button onClick={noAnswer} className={btn}>
          <span className="text-lg">📵</span>
          ללא מענה{contact.noAnswerCount ? ` (${contact.noAnswerCount})` : ""}
        </button>
        <button onClick={() => setScheduling(true)} className={btn}>
          <span className="text-lg">📅</span>
          קבעתי פגישה
        </button>
        <button onClick={afterMeeting} className={btn}>
          <span className="text-lg">🤝</span>
          אחרי פגישה
        </button>
      </div>

      {scheduling && (
        <MeetingSheet
          contact={contact}
          onClose={() => setScheduling(false)}
          onScheduled={async (appointment, online) => {
            setScheduling(false);
            await moveTo(STAGE_FOR.meeting);
            setComposer({ appointment, templateId: templateFor(online ? "meeting_online" : "meeting_office") });
          }}
        />
      )}
      {composer && (
        <WhatsAppSheet contact={contact} appointment={composer.appointment} templateId={composer.templateId} onClose={() => setComposer(null)} />
      )}
    </>
  );
}
