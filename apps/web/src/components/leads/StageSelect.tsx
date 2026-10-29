"use client";

import { useStore } from "@/lib/store";
import { colorAt } from "@/components/ui/ColorChip";
import type { Contact, Opportunity } from "@/lib/types";

const OUTCOME: Record<string, { label: string; color: string }> = {
  won: { label: "נסגרה עסקה", color: "#16a34a" },
  lost: { label: "לא נסגרה עסקה", color: "#64748b" },
  abandoned: { label: "בוטלה עסקה", color: "#94a3b8" },
};

// The lead's pipeline stage as a coloured pill that doubles as the control:
//  • open deal → pick another stage (moves it, like dragging on the board);
//  • closed deal → pick a stage to reopen it there;
//  • no deal yet (a brand-new lead the server hasn't finished setting up) →
//    it counts as being in the first stage of the first pipeline.
export function StageSelect({ contact, deal, afterMove, large }: { contact: Contact; deal?: Opportunity; afterMove?: (oppId: string, stageId: string, fresh?: boolean) => void; large?: boolean }) {
  const { pipelines, moveOpportunity, setOpportunityStatus, addOpportunity } = useStore();
  if (!pipelines.length) return <span className="text-neutral-400">—</span>;

  // Every lead has a stage; without a deal it's the first stage of the first pipeline.
  const dealPipeline = deal ? pipelines.find((p) => p.id === deal.pipelineId) : pipelines[0];
  const open = deal?.status === "open";
  const shownStageId = open ? deal!.stageId : deal ? undefined : dealPipeline?.stages[0]?.id;
  const stageIndex = shownStageId ? dealPipeline?.stages.findIndex((s) => s.id === shownStageId) ?? -1 : -1;
  const color = shownStageId ? colorAt(dealPipeline?.stages[stageIndex]?.color, stageIndex) : deal ? OUTCOME[deal.status].color : "#94a3b8";
  const current = deal && !open ? `outcome:${deal.status}` : shownStageId ? `${dealPipeline!.id}|${shownStageId}` : "";
  const choices = dealPipeline ? [dealPipeline] : pipelines;

  async function choose(value: string) {
    if (!value || value.startsWith("outcome:") || (deal && value === current)) return;
    const [pipelineId, stageId] = value.split("|");
    if (deal) {
      if (!open) await setOpportunityStatus(deal.id, "open");
      afterMove?.(deal.id, stageId);
      await moveOpportunity(deal.id, stageId);
    } else {
      const created = await addOpportunity({ contactId: contact.id, pipelineId, stageId, title: contact.name, value: 0 });
      afterMove?.(created.id, stageId, true);
    }
  }

  const valueOf = (pipelineId: string, stageId: string) => `${pipelineId}|${stageId}`;
  return (
    <span className={`relative inline-flex items-center gap-1 rounded-full ps-2 pe-1 py-0.5 whitespace-nowrap font-medium ${large ? "text-sm" : "text-xs"}`} style={{ backgroundColor: `${color}1f`, color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <select
        value={current}
        aria-label="שלב"
        onChange={(e) => choose(e.target.value)}
        className={`appearance-none bg-transparent outline-none cursor-pointer pe-1 py-0.5 font-medium ${large ? "text-sm" : "text-xs"}`}
        style={{ color }}
      >
        {deal && !open && <option value={current}>{OUTCOME[deal.status].label}</option>}
        {choices.map((p) => (
          <optgroup key={p.id} label={pipelines.length > 1 ? p.name : ""}>
            {p.stages.map((st) => (
              <option key={st.id} value={valueOf(p.id, st.id)}>
                {st.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </span>
  );
}
