"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";
import { useLeadChatHref, useMyGateway } from "@/lib/useMyGateway";
import type { Appointment, Contact } from "@/lib/types";
import { WhatsAppSheet } from "./WhatsAppSheet";
import { MeetingSheet } from "./MeetingSheet";

// Stage each action moves the lead's open deal to: the first stage whose
// name contains this. "No answer" only moves a deal still in the first stage.
const STAGE_FOR = { noAnswer: "ללא מענה", meeting: "נקבעה פגישה", afterMeeting: "אחרי פגישה" };

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Composer = { templateId?: string; appointment?: Appointment } | null;

export function QuickActions({ contact }: { contact: Contact }) {
  const { opportunities, pipelines, messageTemplates, members, currentMemberId, leadStatuses, automations, moveOpportunity, updateContact, addTask, addNote, setHandlingStatus } =
    useStore();
  const [composer, setComposer] = useState<Composer>(null);
  const [scheduling, setScheduling] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const { ready: autoSend } = useMyGateway();
  const chatHref = useLeadChatHref(contact.id);
  const agentName = members.find((m) => m.id === currentMemberId)?.name;
  const templateFor = (action: string) => messageTemplates.find((t) => t.quickAction === action)?.id;

  // An active automation on entering this stage sends the message itself.
  function stageAutomated(stageName: string): boolean {
    const opp = opportunities.find((o) => o.contactId === contact.id && o.status === "open");
    const stage = pipelines.find((p) => p.id === opp?.pipelineId)?.stages.find((st) => st.name.includes(stageName));
    return Boolean(
      stage && automations.some((a) => a.active && a.trigger.type === "stage_change" && a.trigger.stageId === stage.id && a.steps.some((st) => st.type === "send_message"))
    );
  }

  async function moveTo(stageName: string, onlyFromFirst = false): Promise<boolean> {
    const opp = opportunities.find((o) => o.contactId === contact.id && o.status === "open");
    const pipeline = opp && pipelines.find((p) => p.id === opp.pipelineId);
    const target = pipeline?.stages.find((s) => s.name.includes(stageName));
    if (!opp || !pipeline || !target || opp.stageId === target.id) return false;
    if (onlyFromFirst && pipeline.stages[0]?.id !== opp.stageId) return false;
    await moveOpportunity(opp.id, target.id);
    return true;
  }

  // With a linked WhatsApp the message goes out on its own; otherwise (or if
  // sending fails) WhatsApp opens on the agent's phone with the text ready.
  async function deliver(templateId: string | undefined, appointment?: Appointment) {
    const template = messageTemplates.find((t) => t.id === templateId);
    if (!autoSend || !template || (!template.body.trim() && !template.attachment)) {
      setComposer({ templateId, appointment });
      return;
    }
    setNotice({ ok: true, text: `שולח: ${template.name}…` });
    try {
      await apiPost(`/api/leads/${contact.id}/whatsapp`, { templateId, appointmentId: appointment?.id });
      setNotice({ ok: true, text: `✓ נשלח בוואטסאפ: ${template.name}` });
    } catch (err) {
      setNotice({ ok: false, text: `השליחה האוטומטית נכשלה (${err instanceof ApiError ? err.message : "שגיאה"}) — אפשר לשלוח ידנית` });
      setComposer({ templateId, appointment });
    }
  }

  async function noAnswer() {
    // Continue from the current "no answer N" status too (e.g. imported leads).
    const fromStatus = Number(contact.handlingStatus?.match(/ללא מענה (\d)/)?.[1] ?? 0);
    const attempt = Math.max(contact.noAnswerCount, fromStatus) + 1;
    await updateContact(contact.id, { noAnswerCount: attempt });
    await addNote(contact.id, `📵 ללא מענה — ניסיון ${attempt}${agentName ? ` (${agentName})` : ""}`);
    await moveTo(STAGE_FOR.noAnswer, true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await addTask({ title: `לחייג שוב ל${contact.name} (ניסיון ${attempt + 1})`, contactId: contact.id, assignee: agentName, dueDate: localDay(tomorrow) });
    // If the business keeps a "no answer N" handling status, set it — and if an
    // automation sends a message on that status, let it do the sending.
    const statusName = leadStatuses.find((st) => st.name === `ללא מענה ${attempt}`)?.name;
    if (statusName) await setHandlingStatus(contact.id, statusName);
    const automated =
      statusName &&
      automations.some((a) => a.active && a.trigger.type === "status_changed" && a.trigger.status === statusName && a.steps.some((st) => st.type === "send_message"));
    if (automated) {
      setNotice({ ok: true, text: `הסטטוס עודכן ל"${statusName}" — ההודעה נשלחת באוטומציה` });
      return;
    }
    await deliver(templateFor(`no_answer_${Math.min(attempt, 4)}`));
  }

  async function afterMeeting() {
    if ((await moveTo(STAGE_FOR.afterMeeting)) && stageAutomated(STAGE_FOR.afterMeeting)) {
      setNotice({ ok: true, text: "הליד עבר ל\"אחרי פגישה\" — ההודעה נשלחת באוטומציה" });
      return;
    }
    await deliver(templateFor("after_meeting"));
  }

  const btn = "flex flex-col items-center justify-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 py-2.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-40";

  return (
    <>
      <div className="grid grid-cols-5 gap-2 mb-5">
        <a href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : undefined} aria-disabled={!contact.phone} className={`${btn} ${contact.phone ? "" : "pointer-events-none opacity-40"}`}>
          <span className="text-lg">📞</span>
          התקשרות
        </a>
        <Link href={chatHref} aria-disabled={!contact.phone} className={`${btn} ${contact.phone ? "" : "pointer-events-none opacity-40"}`}>
          <span className="text-lg">💬</span>
          וואטסאפ
        </Link>
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
      {notice && <p className={`-mt-3 mb-4 text-xs ${notice.ok ? "text-emerald-600" : "text-amber-600"}`}>{notice.text}</p>}

      {scheduling && (
        <MeetingSheet
          contact={contact}
          autoSend={autoSend}
          onClose={() => setScheduling(false)}
          onScheduled={async (appointment, online) => {
            setScheduling(false);
            // Automations send from the agent's WhatsApp or the business number.
            if ((await moveTo(STAGE_FOR.meeting)) && stageAutomated(STAGE_FOR.meeting)) {
              setNotice({ ok: true, text: "הפגישה נקבעה — אישור הפגישה נשלח באוטומציה" });
              return;
            }
            await deliver(templateFor(online ? "meeting_online" : "meeting_office"), appointment);
          }}
        />
      )}
      {composer && (
        <WhatsAppSheet contact={contact} appointment={composer.appointment} templateId={composer.templateId} onClose={() => setComposer(null)} />
      )}
    </>
  );
}
