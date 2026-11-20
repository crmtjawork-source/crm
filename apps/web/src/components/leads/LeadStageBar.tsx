"use client";

import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { colorAt } from "@/components/ui/ColorChip";
import type { Contact } from "@/lib/types";

const OUTCOME = { won: "נסגרה עסקה", lost: "לא נסגרה עסקה", abandoned: "בוטלה עסקה" } as const;

// The deal's pipeline as a progress bar: stages already passed are filled, tap one to move there.
export function LeadStageBar({ contact, afterMove }: { contact: Contact; afterMove?: (oppId: string, stageId: string, fresh?: boolean) => void }) {
  const { opportunities, pipelines, moveOpportunity, setOpportunityStatus } = useStore();
  const deals = opportunities.filter((o) => o.contactId === contact.id);
  const deal = deals.find((o) => o.status === "open") ?? [...deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const pipeline = deal ? pipelines.find((p) => p.id === deal.pipelineId) : undefined;
  if (!deal || !pipeline || pipeline.stages.length < 2) return null;

  const open = deal.status === "open";
  const current = open ? pipeline.stages.findIndex((s) => s.id === deal.stageId) : -1;

  async function go(stageId: string, index: number) {
    if (open && index === current) return;
    if (!open) await setOpportunityStatus(deal.id, "open");
    if (await moveOpportunity(deal.id, stageId)) afterMove?.(deal.id, stageId);
  }

  return (
    <div className="mb-4" role="group" aria-label="שלב בפייפליין">
      <ol className="flex gap-1">
        {pipeline.stages.map((st, i) => {
          const color = colorAt(st.color, i);
          const reached = open && i <= current;
          return (
            <li key={st.id} className="flex-1 min-w-0">
              <button onClick={() => go(st.id, i)} className="group block w-full text-start" aria-current={open && i === current ? "step" : undefined} title={`מעבר לשלב ${st.name}`}>
                <span className="block h-1.5 rounded-full transition-colors duration-200 group-hover:brightness-90" style={{ backgroundColor: reached ? color : "color-mix(in srgb, currentColor 12%, transparent)" }} />
                <span className={`mt-1.5 flex items-center gap-1 text-[11.5px] leading-tight truncate ${open && i === current ? "font-semibold text-neutral-900 dark:text-white" : "text-neutral-500"}`}>
                  {open && i < current && <Check size={11} className="shrink-0" aria-hidden />}
                  <span className="truncate">{st.name}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {!open && <p className="mt-2 text-xs font-medium text-neutral-500">{OUTCOME[deal.status as keyof typeof OUTCOME] ?? ""}. לחיצה על שלב פותחת את העסקה מחדש.</p>}
    </div>
  );
}
