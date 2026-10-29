"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";
import { useMyGateway } from "@/lib/useMyGateway";
import type { Appointment, Contact } from "@/lib/types";
import { WhatsAppSheet } from "./WhatsAppSheet";
import { MeetingSheet } from "./MeetingSheet";

// Stage each action moves the lead's open deal to: the first stage whose
// name contains this. "No answer" only moves a deal still in the first stage.
export const STAGE_FOR = { noAnswer: "ללא מענה", meeting: "נקבעה פגישה", afterMeeting: "אחרי פגישה" };

type Composer = { templateId?: string; appointment?: Appointment } | null;

// The lead-card actions (no answer / meeting / after meeting), shared by the
// card's buttons and by moving a lead between pipeline stages. `moved` means
// the deal is already in the action's stage (it was just dragged there).
export function useLeadActions(contact: Contact, { openMeeting = false } = {}) {
  const { opportunities, pipelines, messageTemplates, members, currentMemberId, leadStatuses, automations, moveOpportunity, updateContact, addNote, setHandlingStatus } =
    useStore();
  const [composer, setComposer] = useState<Composer>(null);
  const [scheduling, setScheduling] = useState<{ moved: boolean } | null>(openMeeting ? { moved: true } : null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const { ready: autoSend } = useMyGateway();
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

  async function noAnswer({ moved = false } = {}) {
    // Continue from the current "no answer N" status too (e.g. imported leads).
    const fromStatus = Number(contact.handlingStatus?.match(/ללא מענה (\d)/)?.[1] ?? 0);
    const attempt = Math.max(contact.noAnswerCount, fromStatus) + 1;
    await updateContact(contact.id, { noAnswerCount: attempt });
    await addNote(contact.id, `📵 ללא מענה — ניסיון ${attempt}${agentName ? ` (${agentName})` : ""}`);
    const movedNow = moved || (await moveTo(STAGE_FOR.noAnswer, true));
    // If the business keeps a "no answer N" handling status, set it — and if an
    // automation sends a message on that status, let it do the sending.
    const statusName = leadStatuses.find((st) => st.name === `ללא מענה ${attempt}`)?.name;
    if (statusName) await setHandlingStatus(contact.id, statusName);
    // Either the new status or the "no answer" stage the deal just entered may have an automation that sends.
    const automated =
      (statusName &&
        automations.some((a) => a.active && a.trigger.type === "status_changed" && a.trigger.status === statusName && a.steps.some((st) => st.type === "send_message"))) ||
      (movedNow && stageAutomated(STAGE_FOR.noAnswer));
    if (automated) {
      setNotice({ ok: true, text: statusName ? `הסטטוס עודכן ל"${statusName}" — ההודעה נשלחת באוטומציה` : 'הליד עבר לשלב "ללא מענה" — ההודעה נשלחת באוטומציה' });
      return;
    }
    await deliver(templateFor(`no_answer_${Math.min(attempt, 4)}`));
  }

  async function afterMeeting({ moved = false } = {}) {
    if ((moved || (await moveTo(STAGE_FOR.afterMeeting))) && stageAutomated(STAGE_FOR.afterMeeting)) {
      setNotice({ ok: true, text: "הליד עבר ל\"אחרי פגישה\" — ההודעה נשלחת באוטומציה" });
      return;
    }
    await deliver(templateFor("after_meeting"));
  }

  // Opens the meeting form; once scheduled, the confirmation goes out.
  function startMeeting({ moved = false } = {}) {
    setScheduling({ moved });
  }

  const overlays = (
    <>
      {scheduling && (
        <MeetingSheet
          contact={contact}
          autoSend={autoSend}
          onClose={() => setScheduling(null)}
          onScheduled={async (appointment, online) => {
            const moved = scheduling.moved;
            setScheduling(null);
            // Automations send from the agent's WhatsApp or the business number.
            if ((moved || (await moveTo(STAGE_FOR.meeting))) && stageAutomated(STAGE_FOR.meeting)) {
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

  return { noAnswer, afterMeeting, startMeeting, notice, overlays, busy: Boolean(scheduling || composer) };
}
