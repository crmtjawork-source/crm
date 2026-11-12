"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { QuickActions } from "@/components/leads/QuickActions";
import { LeadUpcoming } from "@/components/leads/LeadUpcoming";
import { LeadNotesPanel } from "@/components/leads/LeadNotesPanel";
import { StageSelect } from "@/components/leads/StageSelect";
import { StatusSelect } from "@/components/leads/StatusSelect";
import { useStageMovePrompt } from "@/components/leads/StageMovePrompt";

// The lead's card inside a WhatsApp chat: where it stands, what's coming,
// the notes — everything needed to talk to them without leaving the chat.
export function LeadPanel({ contact }: { contact: Contact }) {
  const { opportunities, leadStatuses } = useStore();
  const stagePrompt = useStageMovePrompt();
  const deals = opportunities.filter((o) => o.contactId === contact.id);
  const deal = deals.find((o) => o.status === "open") ?? [...deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{contact.name}</p>
          {contact.phone && (
            <p className="text-sm text-neutral-500" dir="ltr">
              {contact.phone}
            </p>
          )}
        </div>
        <Link href={`/contacts/${contact.id}`} className="text-xs text-neutral-500 hover:underline shrink-0">
          כרטיס מלא ‹
        </Link>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">שלב:</span>
        <StageSelect contact={contact} deal={deal} afterMove={stagePrompt.afterMove} />
      </div>
      {stagePrompt.element}
      {leadStatuses.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">סטטוס:</span>
          <StatusSelect contact={contact} />
        </div>
      )}
      <QuickActions contact={contact} />
      <LeadUpcoming contact={contact} />
      <LeadNotesPanel contact={contact} />
    </div>
  );
}
