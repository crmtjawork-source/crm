"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Automation, AutomationStep, AutomationStepType, AutomationTriggerType, Channel } from "@/lib/types";

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  new_contact: "ליד חדש נוצר",
  stage_change: "הזדמנות עברה לשלב",
  tag_added: "תגית נוספה",
};

const STEP_LABELS: Record<AutomationStepType, string> = {
  send_message: "שליחת הודעת וואטסאפ",
  wait: "המתנה",
  add_tag: "הוספת תגית",
  notify: "התראה פנימית",
};

const inputClass = "px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

export default function AutomationsPage() {
  const { automations, pipelines, addAutomation, updateAutomation, deleteAutomation } = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("new_contact");
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const [stageId, setStageId] = useState("");
  const [tag, setTag] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const trigger: Automation["trigger"] =
      triggerType === "stage_change"
        ? { type: "stage_change", pipelineId, stageId: stageId || undefined }
        : triggerType === "tag_added"
        ? { type: "tag_added", tag: tag.trim() || undefined }
        : { type: "new_contact" };
    const automation = await addAutomation({ name: name.trim(), trigger });
    setName("");
    setCreating(false);
    setExpandedId(automation.id);
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">אוטומציות</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        >
          + אוטומציה חדשה
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        רצפים לינאריים: טריגר ואז שרשרת צעדים שרצים בשרת. הודעה ראשונה לליד (או אחרי 24 שעות בלי תגובה ממנו) חייבת להיות
        תבנית מאושרת של וואטסאפ; טקסט חופשי עובד רק בתוך 24 שעות מההודעה האחרונה שלו. אפשר לבחור מאיזה מספר כל הודעה יוצאת.
        אפשר להשתמש ב-{"{{first_name}}"}, {"{{name}}"}, {"{{field:שם שדה}}"} בתוכן ובפרמטרים, וב-{"{{booking_token}}"} כסיומת לכפתור
        קישור אישי לקביעת שיחה.
      </p>

      {creating && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <label className="block text-sm">
            <span className="block text-xs text-neutral-500 mb-1">שם האוטומציה</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-neutral-500 mb-1">טריגר — מתי להפעיל</span>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
              className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            >
              {Object.entries(TRIGGER_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {triggerType === "stage_change" && (
            <div className="flex gap-2">
              <label className="text-sm flex-1">
                <span className="block text-xs text-neutral-500 mb-1">פייפליין</span>
                <select
                  value={pipelineId}
                  onChange={(e) => {
                    setPipelineId(e.target.value);
                    setStageId("");
                  }}
                  className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm flex-1">
                <span className="block text-xs text-neutral-500 mb-1">שלב (ריק = כל שלב)</span>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
                >
                  <option value="">כל שלב</option>
                  {selectedPipeline?.stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {triggerType === "tag_added" && (
            <label className="block text-sm">
              <span className="block text-xs text-neutral-500 mb-1">תגית (ריק = כל תגית)</span>
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              יצירה
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm text-neutral-400">
              ביטול
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {automations.map((a) => (
          <AutomationRow
            key={a.id}
            automation={a}
            expanded={expandedId === a.id}
            onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
            onToggleActive={() => updateAutomation(a.id, { active: !a.active })}
            onToggleStopOnReply={() => updateAutomation(a.id, { stopOnReply: !a.stopOnReply })}
            onDelete={() => deleteAutomation(a.id)}
          />
        ))}
        {automations.length === 0 && <p className="text-sm text-neutral-400">אין עדיין אוטומציות.</p>}
      </ul>
    </div>
  );
}

function triggerSummary(automation: Automation, pipelines: ReturnType<typeof useStore>["pipelines"]): string {
  const t = automation.trigger;
  if (t.type === "new_contact") return TRIGGER_LABELS.new_contact;
  if (t.type === "stage_change") {
    const pipeline = pipelines.find((p) => p.id === t.pipelineId);
    const stage = pipeline?.stages.find((s) => s.id === t.stageId);
    return `${TRIGGER_LABELS.stage_change}${pipeline ? ` — ${pipeline.name}` : ""}${stage ? ` / ${stage.name}` : ""}`;
  }
  return `${TRIGGER_LABELS.tag_added}${t.tag ? ` — "${t.tag}"` : ""}`;
}

function stepSummary(step: AutomationStep, channels: Channel[]): string {
  switch (step.type) {
    case "send_message": {
      const channel = channels.find((c) => c.id === step.channelId);
      const from = ` · מ${channel ? channel.name : "מספר ברירת המחדל"}`;
      if (step.templateName) {
        const params = step.templateParams?.length ? ` (${step.templateParams.join(", ")})` : "";
        const button = step.templateButtonParam ? ` · קישור: ${step.templateButtonParam}` : "";
        return `: תבנית "${step.templateName}"${params}${button}${from}`;
      }
      return `: "${step.message ?? ""}"${from}`;
    }
    case "wait":
      return `: ${step.waitMinutes} דק'`;
    case "add_tag":
      return `: "${step.tag}"`;
    case "notify":
      return `: "${step.notifyText}"`;
  }
}

function AutomationRow({
  automation,
  expanded,
  onToggle,
  onToggleActive,
  onToggleStopOnReply,
  onDelete,
}: {
  automation: Automation;
  expanded: boolean;
  onToggle: () => void;
  onToggleActive: () => void;
  onToggleStopOnReply: () => void;
  onDelete: () => void;
}) {
  const { pipelines, channels, automationRuns, addAutomationStep, removeAutomationStep } = useStore();
  const [stepType, setStepType] = useState<AutomationStepType>("send_message");
  const [stepValue, setStepValue] = useState("");
  const [waitMinutes, setWaitMinutes] = useState("60");
  const [channelId, setChannelId] = useState("");
  const [messageMode, setMessageMode] = useState<"template" | "text">("template");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("he");
  const [templateParams, setTemplateParams] = useState("");
  const [templateButtonParam, setTemplateButtonParam] = useState("");
  const runs = automationRuns.filter((r) => r.automationId === automation.id);
  const waitingCount = runs.filter((r) => r.status === "waiting").length;
  const activeChannels = channels.filter((c) => c.active);

  function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    if (stepType === "wait") {
      addAutomationStep(automation.id, { type: "wait", waitMinutes: Number(waitMinutes) || 0 });
    } else if (stepType === "send_message") {
      if (messageMode === "template") {
        if (!templateName.trim()) return;
        addAutomationStep(automation.id, {
          type: "send_message",
          channelId: channelId || undefined,
          templateName: templateName.trim(),
          templateLanguage: templateLanguage.trim() || "he",
          templateParams: templateParams
            .split("|")
            .map((p) => p.trim())
            .filter(Boolean),
          templateButtonParam: templateButtonParam.trim() || undefined,
        });
        setTemplateName("");
        setTemplateParams("");
        setTemplateButtonParam("");
      } else {
        if (!stepValue.trim()) return;
        addAutomationStep(automation.id, { type: "send_message", channelId: channelId || undefined, message: stepValue.trim() });
      }
    } else if (stepType === "add_tag") {
      if (!stepValue.trim()) return;
      addAutomationStep(automation.id, { type: "add_tag", tag: stepValue.trim() });
    } else if (stepType === "notify") {
      if (!stepValue.trim()) return;
      addAutomationStep(automation.id, { type: "notify", notifyText: stepValue.trim() });
    }
    setStepValue("");
  }

  return (
    <li className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="text-start flex-1">
          <p className="font-medium text-sm">{automation.name}</p>
          <p className="text-xs text-neutral-500">
            {triggerSummary(automation, pipelines)} · {automation.steps.length} צעדים · {runs.length} הפעלות
            {waitingCount > 0 && ` · ${waitingCount} ממתינות להמשך`}
          </p>
        </button>
        <div className="flex items-center gap-3 text-xs shrink-0">
          <label className="flex items-center gap-1" title="ליד שעונה בוואטסאפ יוצא מהרצף ולא יקבל את ההודעות הבאות">
            <input type="checkbox" checked={automation.stopOnReply} onChange={onToggleStopOnReply} />
            עצירה כשהליד עונה
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={automation.active} onChange={onToggleActive} />
            פעיל
          </label>
          <button onClick={onDelete} className="text-neutral-400 hover:text-red-500">
            מחיקה
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-neutral-200 dark:border-neutral-800 pt-3">
          <ol className="space-y-2 mb-3">
            {automation.steps.map((step, i) => (
              <li key={step.id} className="flex items-center justify-between gap-2 text-sm bg-neutral-50 dark:bg-neutral-900 rounded-md px-3 py-2">
                <span>
                  {i + 1}. {STEP_LABELS[step.type]}
                  {stepSummary(step, channels)}
                </span>
                <button onClick={() => removeAutomationStep(automation.id, step.id)} className="text-neutral-400 hover:text-red-500 text-xs shrink-0">
                  הסרה
                </button>
              </li>
            ))}
            {automation.steps.length === 0 && <p className="text-sm text-neutral-400">אין עדיין צעדים.</p>}
          </ol>

          <form onSubmit={handleAddStep} className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <select value={stepType} onChange={(e) => setStepType(e.target.value as AutomationStepType)} className={inputClass}>
                {Object.entries(STEP_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              {stepType === "wait" && (
                <input
                  value={waitMinutes}
                  onChange={(e) => setWaitMinutes(e.target.value)}
                  type="number"
                  min={0}
                  placeholder="דקות"
                  className={`w-28 ${inputClass}`}
                />
              )}
              {(stepType === "add_tag" || stepType === "notify") && (
                <input
                  value={stepValue}
                  onChange={(e) => setStepValue(e.target.value)}
                  placeholder={stepType === "add_tag" ? "שם התגית" : "טקסט ההתראה"}
                  className={`flex-1 min-w-[10rem] ${inputClass}`}
                />
              )}
              {stepType === "send_message" && (
                <>
                  <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={inputClass} title="מאיזה מספר ההודעה יוצאת">
                    <option value="">מספר ברירת המחדל</option>
                    {activeChannels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}
                      </option>
                    ))}
                  </select>
                  <select value={messageMode} onChange={(e) => setMessageMode(e.target.value as "template" | "text")} className={inputClass}>
                    <option value="template">תבנית מאושרת</option>
                    <option value="text">טקסט חופשי (רק בתוך 24 שעות)</option>
                  </select>
                </>
              )}
            </div>

            {stepType === "send_message" && messageMode === "template" && (
              <div className="flex flex-wrap gap-2">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="שם התבנית"
                  dir="ltr"
                  className={`flex-1 min-w-[10rem] ${inputClass}`}
                />
                <input
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                  dir="ltr"
                  title="קוד שפה"
                  className={`w-16 ${inputClass}`}
                />
                <input
                  value={templateParams}
                  onChange={(e) => setTemplateParams(e.target.value)}
                  placeholder="פרמטרים מופרדים ב-| (למשל {{first_name}} | חוליאן)"
                  className={`flex-[2] min-w-[14rem] ${inputClass}`}
                />
                <input
                  value={templateButtonParam}
                  onChange={(e) => setTemplateButtonParam(e.target.value)}
                  placeholder="סיומת לכפתור הקישור (למשל {{booking_token}})"
                  title="לתבנית עם כפתור קישור דינמי — הכפתור הזה חייב להיות הראשון בתבנית"
                  dir="ltr"
                  className={`w-full ${inputClass}`}
                />
              </div>
            )}
            {stepType === "send_message" && messageMode === "text" && (
              <textarea
                value={stepValue}
                onChange={(e) => setStepValue(e.target.value)}
                rows={3}
                placeholder="תוכן ההודעה — למשל: היי {{first_name}}, ניסיתי לחייג ולא היה מענה…"
                className={`w-full ${inputClass}`}
              />
            )}

            <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
              הוספת צעד
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
