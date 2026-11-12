"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Handshake, Lightbulb, MessageCircle, Phone } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLeadChatHref } from "@/lib/useMyGateway";
import { nextStepFor } from "@/lib/nextStep";
import type { Contact } from "@/lib/types";
import { useLeadActions } from "./useLeadActions";

const TONE = {
  info: "border-tint/30 bg-tint/10",
  warn: "border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800",
  urgent: "border-red-300/60 bg-red-50 dark:bg-red-950/30 dark:border-red-900",
} as const;

// "What should I do now?" — one suggestion with a button that does it.
export function NextStepCard({ contact }: { contact: Contact }) {
  const { opportunities, pipelines } = useStore();
  const { startMeeting, afterMeeting, overlays } = useLeadActions(contact);
  const chatHref = useLeadChatHref(contact.id);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const deals = opportunities.filter((o) => o.contactId === contact.id);
  const deal = deals.find((o) => o.status === "open") ?? [...deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const stageName = deal && pipelines.find((p) => p.id === deal.pipelineId)?.stages.find((s) => s.id === deal.stageId)?.name;
  const step = nextStepFor({ contact, deal, stageName });
  if (!step || dismissed === step.title) return null;

  const btn = "inline-flex items-center gap-1.5 min-h-9 rounded-lg px-3.5 text-sm font-semibold";
  const phoneHref = contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : undefined;
  return (
    <div className={`mb-4 rounded-2xl border p-4 ${TONE[step.tone]}`} role="region" aria-label="הצעד הבא">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint text-white">
          <Lightbulb size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-tint">הצעד הבא</p>
          <p className="font-semibold leading-snug">{step.title}</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-0.5">{step.detail}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.action === "whatsapp" && (
              <Link href={chatHref} className={`${btn} bg-whatsapp text-white`}>
                <MessageCircle size={16} aria-hidden />
                {step.actionLabel}
              </Link>
            )}
            {step.action === "call" && (
              <a href={phoneHref} className={`${btn} bg-tint text-white`}>
                <Phone size={16} aria-hidden />
                {step.actionLabel}
              </a>
            )}
            {step.action === "meeting" && (
              <button onClick={() => startMeeting()} className={`${btn} bg-tint text-white`}>
                <CalendarPlus size={16} aria-hidden />
                {step.actionLabel}
              </button>
            )}
            {step.action === "afterMeeting" && (
              <button onClick={() => afterMeeting()} className={`${btn} bg-tint text-white`}>
                <Handshake size={16} aria-hidden />
                {step.actionLabel}
              </button>
            )}
            <button onClick={() => setDismissed(step.title)} className="min-h-9 rounded-lg px-3 text-sm text-neutral-500 hover:bg-black/[.05] dark:hover:bg-white/10">
              לא עכשיו
            </button>
          </div>
        </div>
      </div>
      {overlays}
    </div>
  );
}
