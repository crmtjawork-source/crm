"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { setGateCheck, uploadGateFiles, useLeadGateState, useStageGates } from "@/lib/gates";
import type { Contact } from "@/lib/types";

// The requirements of the stage the lead's open deal is in (checklist items +
// documents), shown on the lead card from the moment the deal enters the stage.
export function StageRequirements({ contact }: { contact: Contact }) {
  const { orgId, opportunities, pipelines } = useStore();
  const { gates } = useStageGates();
  const { checked, fileNames } = useLeadGateState(contact.id);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const deal = opportunities.find((o) => o.contactId === contact.id && o.status === "open");
  if (!deal) return null;
  const stages = pipelines.find((p) => p.id === deal.pipelineId)?.stages ?? [];
  const mine = gates.filter((g) => g.direction === "leave" && g.stageId === deal.stageId);
  if (!mine.length) return null;
  const doneCount = mine.filter((g) => (g.kind === "check" ? checked.has(g.id) : fileNames.has(g.id))).length;

  return (
    <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">דרישות בשלב הנוכחי</h2>
        <span className={`text-xs ${doneCount === mine.length ? "text-emerald-600" : "text-neutral-500"}`}>
          {doneCount}/{mine.length} הושלמו
        </span>
      </div>
      <ul className="space-y-1.5">
        {mine.map((g) => {
          const target = g.targetStageId ? stages.find((s) => s.id === g.targetStageId)?.name : undefined;
          const files = fileNames.get(g.id);
          return (
            <li key={g.id} className="flex items-center gap-2 text-sm rounded-md bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-2">
              {g.kind === "check" ? (
                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <input type="checkbox" checked={checked.has(g.id)} onChange={(e) => void setGateCheck(orgId, contact.id, g.id, e.target.checked)} />
                  <span className={checked.has(g.id) ? "line-through text-neutral-400" : ""}>{g.label}</span>
                </label>
              ) : (
                <>
                  <span className="flex-1">
                    {files ? "✅" : "📎"} {g.label}
                    {files && <span className="text-xs text-neutral-400"> · {files.length} קבצים</span>}
                  </span>
                  <label className="text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer">
                    {busy === g.id ? "מעלה…" : files ? "+ עוד" : "העלאה"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={busy === g.id}
                      onChange={async (e) => {
                        const list = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (!list.length) return;
                        setBusy(g.id);
                        setError(await uploadGateFiles(orgId, contact.id, g.id, list));
                        setBusy("");
                      }}
                    />
                  </label>
                </>
              )}
              <span className="text-[11px] text-neutral-400 shrink-0">{target ? `נדרש למעבר ל"${target}"` : "נדרש לפני המעבר הבא"}</span>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </section>
  );
}
