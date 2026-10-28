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
//  • no deal → pick a stage to put the lead on the pipeline.
export function StageSelect({ contact, deal, afterMove }: { contact: Contact; deal?: Opportunity; afterMove?: (oppId: string, stageId: string, fresh?: boolean) => void }) {
  const { pipelines, moveOpportunity, setOpportunityStatus, addOpportunity } = useStore();
  if (!pipelines.length) return <span className="text-neutral-400">—</span>;

  const dealPipeline = deal ? pipelines.find((p) => p.id === deal.pipelineId) : undefined;
  const open = deal?.status === "open";
  const stageIndex = open ? dealPipeline?.stages.findIndex((s) => s.id === deal!.stageId) ?? -1 : -1;
  const color = open ? colorAt(dealPipeline?.stages[stageIndex]?.color, stageIndex) : deal ? OUTCOME[deal.status].color : "#94a3b8";
  const current = open ? deal!.stageId : deal ? `outcome:${deal.status}` : "";
  // A lead with no deal can go to any pipeline; a deal stays in its own.
  const choices = dealPipeline ? [dealPipeline] : pipelines;

  async function choose(value: string) {
    if (!value || value === current || value.startsWith("outcome:")) return;
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
    <span className="relative inline-flex items-center gap-1 rounded-full ps-2 pe-1 py-0.5 text-xs whitespace-nowrap" style={{ backgroundColor: `${color}1f`, color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <select
        value={open ? valueOf(deal!.pipelineId, deal!.stageId) : current}
        aria-label="שלב"
        onChange={(e) => choose(e.target.value)}
        className="appearance-none bg-transparent outline-none cursor-pointer pe-1 py-0.5 text-xs"
        style={{ color }}
      >
        {!open && <option value={current}>{deal ? OUTCOME[deal.status].label : "ללא שלב"}</option>}
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
