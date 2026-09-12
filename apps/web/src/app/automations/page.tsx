"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Automation, AutomationStepType, AutomationTriggerType } from "@/lib/types";

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  new_contact: "ליד חדש נוצר",
  stage_change: "הזדמנות עברה לשלב",
  tag_added: "תגית נוספה",
};

const STEP_LABELS: Record<AutomationStepType, string> = {
  send_message: "שליחת הודעה (מדומה)",
  wait: "המתנה",
  add_tag: "הוספת תגית",
  notify: "התראה פנימית",
};

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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const trigger: Automation["trigger"] =
      triggerType === "stage_change"
        ? { type: "stage_change", pipelineId, stageId: stageId || undefined }
        : triggerType === "tag_added"
        ? { type: "tag_added", tag: tag.trim() || undefined }
        : { type: "new_contact" };
    const automation = addAutomation({ name: name.trim(), trigger });
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
        רצפים לינאריים: טריגר ואז שרשרת צעדים. אין עדיין חיבור לוואטסאפ אמיתי — צעדי &quot;שליחת הודעה&quot; ו&quot;המתנה&quot;
        רק נרשמים בציר הזמן של הלקוח כדי לבדוק את הזרימה; &quot;הוספת תגית&quot; ו&quot;התראה&quot; פועלים במלואם.
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

function AutomationRow({
  automation,
  expanded,
  onToggle,
  onToggleActive,
  onDelete,
}: {
  automation: Automation;
  expanded: boolean;
  onToggle: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const { pipelines, automationRuns, addAutomationStep, removeAutomationStep } = useStore();
  const [stepType, setStepType] = useState<AutomationStepType>("send_message");
  const [stepValue, setStepValue] = useState("");
  const [waitMinutes, setWaitMinutes] = useState("60");
  const runCount = automationRuns.filter((r) => r.automationId === automation.id).length;

  function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    if (stepType === "wait") {
      addAutomationStep(automation.id, { type: "wait", waitMinutes: Number(waitMinutes) || 0 });
    } else if (stepType === "send_message") {
      if (!stepValue.trim()) return;
      addAutomationStep(automation.id, { type: "send_message", message: stepValue.trim() });
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
            {triggerSummary(automation, pipelines)} · {automation.steps.length} צעדים · {runCount} הפעלות
          </p>
        </button>
        <div className="flex items-center gap-3 text-xs shrink-0">
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
              <li key={step.id} className="flex items-center justify-between text-sm bg-neutral-50 dark:bg-neutral-900 rounded-md px-3 py-2">
                <span>
                  {i + 1}. {STEP_LABELS[step.type]}
                  {step.type === "send_message" && `: "${step.message}"`}
                  {step.type === "wait" && `: ${step.waitMinutes} דק'`}
                  {step.type === "add_tag" && `: "${step.tag}"`}
                  {step.type === "notify" && `: "${step.notifyText}"`}
                </span>
                <button onClick={() => removeAutomationStep(automation.id, step.id)} className="text-neutral-400 hover:text-red-500 text-xs">
                  הסרה
                </button>
              </li>
            ))}
            {automation.steps.length === 0 && <p className="text-sm text-neutral-400">אין עדיין צעדים.</p>}
          </ol>

          <form onSubmit={handleAddStep} className="flex flex-wrap gap-2">
            <select
              value={stepType}
              onChange={(e) => setStepType(e.target.value as AutomationStepType)}
              className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            >
              {Object.entries(STEP_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            {stepType === "wait" ? (
              <input
                value={waitMinutes}
                onChange={(e) => setWaitMinutes(e.target.value)}
                type="number"
                placeholder="דקות"
                className="w-28 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
            ) : (
              <input
                value={stepValue}
                onChange={(e) => setStepValue(e.target.value)}
                placeholder={
                  stepType === "send_message" ? "תוכן ההודעה" : stepType === "add_tag" ? "שם התגית" : "טקסט ההתראה"
                }
                className="flex-1 min-w-[10rem] px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
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
