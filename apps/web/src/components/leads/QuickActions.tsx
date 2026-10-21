"use client";

import Link from "next/link";
import { useLeadChatHref } from "@/lib/useMyGateway";
import type { Contact } from "@/lib/types";
import { useLeadActions } from "./useLeadActions";

export function QuickActions({ contact }: { contact: Contact }) {
  const { noAnswer, afterMeeting, startMeeting, notice, overlays } = useLeadActions(contact);
  const chatHref = useLeadChatHref(contact.id);

  const btn = "flex flex-col items-center justify-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 py-2.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-40";

  return (
    <>
      <div className="grid grid-cols-5 gap-2 mb-5">
        <a href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : undefined} aria-disabled={!contact.phone} className={`${btn} ${contact.phone ? "" : "pointer-events-none opacity-40"}`}>
          <span className="text-lg">📞</span>
          התקשרות
        </a>
        <Link href={chatHref} aria-disabled={!contact.phone} className={`${btn} ${contact.phone ? "" : "pointer-events-none opacity-40"}`}>
          <span className="text-lg">💬</span>
          וואטסאפ
        </Link>
        <button onClick={() => noAnswer()} className={btn}>
          <span className="text-lg">📵</span>
          ללא מענה{contact.noAnswerCount ? ` (${contact.noAnswerCount})` : ""}
        </button>
        <button onClick={() => startMeeting()} className={btn}>
          <span className="text-lg">📅</span>
          קבעתי פגישה
        </button>
        <button onClick={() => afterMeeting()} className={btn}>
          <span className="text-lg">🤝</span>
          אחרי פגישה
        </button>
      </div>
      {notice && <p className={`-mt-3 mb-4 text-xs ${notice.ok ? "text-emerald-600" : "text-amber-600"}`}>{notice.text}</p>}

      {overlays}
    </>
  );
}
