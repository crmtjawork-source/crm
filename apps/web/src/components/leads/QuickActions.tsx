"use client";

import Link from "next/link";
import { CalendarPlus, Handshake, MessageCircle, Phone, PhoneOff, type LucideIcon } from "lucide-react";
import { useLeadChatHref } from "@/lib/useMyGateway";
import type { Contact } from "@/lib/types";
import { useLeadActions } from "./useLeadActions";

// Round action buttons (like a contact card): the main ones are filled.
function Round({ icon: Icon, label, filled, disabled }: { icon: LucideIcon; label: string; filled?: string; disabled?: boolean }) {
  return (
    <span className={`flex flex-col items-center gap-1.5 text-[11.5px] font-medium text-tint ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <span
        className={`grid h-12 w-12 place-items-center rounded-full shadow-sm border ${filled ? "text-white border-transparent" : "bg-white dark:bg-neutral-800 border-black/[.06] dark:border-white/10"}`}
        style={filled ? { backgroundColor: filled } : undefined}
      >
        <Icon size={20} strokeWidth={2} aria-hidden />
      </span>
      <span className="text-center leading-tight text-neutral-700 dark:text-neutral-300">{label}</span>
    </span>
  );
}

export function QuickActions({ contact }: { contact: Contact }) {
  const { noAnswer, afterMeeting, startMeeting, notice, overlays } = useLeadActions(contact);
  const chatHref = useLeadChatHref(contact.id);
  const hasPhone = Boolean(contact.phone);

  return (
    <>
      <div className="grid grid-cols-5 gap-2 mb-5">
        <a href={hasPhone ? `tel:${contact.phone!.replace(/[^\d+]/g, "")}` : undefined} aria-disabled={!hasPhone} aria-label="התקשרות">
          <Round icon={Phone} label="התקשרות" filled="var(--tint)" disabled={!hasPhone} />
        </a>
        <Link href={chatHref} aria-disabled={!hasPhone} aria-label="וואטסאפ">
          <Round icon={MessageCircle} label="וואטסאפ" filled="var(--whatsapp)" disabled={!hasPhone} />
        </Link>
        <button onClick={() => noAnswer()} aria-label="ללא מענה">
          <Round icon={PhoneOff} label={`ללא מענה${contact.noAnswerCount ? ` (${contact.noAnswerCount})` : ""}`} />
        </button>
        <button onClick={() => startMeeting()} aria-label="קבעתי פגישה">
          <Round icon={CalendarPlus} label="קבעתי פגישה" />
        </button>
        <button onClick={() => afterMeeting()} aria-label="אחרי פגישה">
          <Round icon={Handshake} label="אחרי פגישה" />
        </button>
      </div>
      {notice && <p className={`-mt-3 mb-4 text-xs ${notice.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{notice.text}</p>}

      {overlays}
    </>
  );
}
