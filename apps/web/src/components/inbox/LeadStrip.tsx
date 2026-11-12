"use client";

import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { StageSelect } from "@/components/leads/StageSelect";
import { StatusSelect } from "@/components/leads/StatusSelect";
import { useStageMovePrompt } from "@/components/leads/StageMovePrompt";
import { splitNote } from "@/lib/noteImages";

// On a phone there's no room beside the chat, so the lead sits in a slim strip
// above it: stage, status and the latest note, with a tap for the whole card.
export function LeadStrip({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  const { opportunities, leadStatuses, activitiesFor } = useStore();
  const stagePrompt = useStageMovePrompt();
  const deals = opportunities.filter((o) => o.contactId === contact.id);
  const deal = deals.find((o) => o.status === "open") ?? [...deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const note = activitiesFor(contact.id).find((a) => a.type === "note");
  const body = note ? splitNote(note.text).body : "";

  return (
    <div className="lg:hidden px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <StageSelect contact={contact} deal={deal} afterMove={stagePrompt.afterMove} />
        {leadStatuses.length > 0 && <StatusSelect contact={contact} />}
        <button onClick={onOpen} className="ms-auto text-xs text-neutral-500 underline">
          כל הכרטיס
        </button>
      </div>
      {stagePrompt.element}
      {body && <p className="text-xs text-neutral-500 truncate">📝 {body.split("\n")[0]}</p>}
    </div>
  );
}
