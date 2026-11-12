"use client";

import { CalendarClock, Clock, PhoneOff, Pencil, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";

const AVATARS = ["#0a84ff", "#ff9f0a", "#bf5af2", "#30d158", "#ff375f", "#5e5ce6", "#64d2ff"];
const colorFor = (s: string) => AVATARS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATARS.length];
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
};
const daysAgo = (iso?: string) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);
const since = (d: number | null) => (d === null ? "—" : d === 0 ? "היום" : d === 1 ? "אתמול" : `לפני ${d} ימים`);

// Top of the lead card: who they are, how the lead is doing, and the edit / delete controls.
export function LeadHero({ contact, canDelete, onEdit, onDelete }: { contact: Contact; canDelete: boolean; onEdit: () => void; onDelete: () => void }) {
  const { opportunities } = useStore();
  const deals = opportunities.filter((o) => o.contactId === contact.id);
  const deal = deals.find((o) => o.status === "open");
  const inStage = deal ? daysAgo(deal.stageChangedAt) : null;
  const lastContact = daysAgo(contact.lastActivityAt);
  const color = colorFor(contact.name);

  const chip = "inline-flex items-center gap-1.5 rounded-full bg-black/[.05] dark:bg-white/10 px-2.5 py-1 text-xs text-neutral-600 dark:text-neutral-300";
  return (
    <div className="mb-5">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-semibold text-white shadow-sm" style={{ backgroundColor: color }} aria-hidden>
          {initials(contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">{contact.name}</h1>
          <p className="flex items-center gap-2 text-xl font-semibold tabular-nums mt-0.5">
            {contact.phone ? (
              <>
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="hover:underline">
                  {contact.phone}
                </a>
                <CopyButton text={contact.phone} label="העתקת מספר טלפון" className="!text-base" />
              </>
            ) : (
              <span className="text-base font-normal text-neutral-400">אין טלפון</span>
            )}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-neutral-500">
            {contact.email ?? "אין אימייל"}
            {contact.email && <CopyButton text={contact.email} label="העתקת אימייל" />}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} aria-label="עריכת פרטים" title="עריכת פרטים" className="grid h-9 w-9 place-items-center rounded-full bg-black/[.05] dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-black/[.09]">
            <Pencil size={15} aria-hidden />
          </button>
          {canDelete && (
            <button onClick={onDelete} aria-label="מחיקת ליד" title="מחיקת ליד" className="grid h-9 w-9 place-items-center rounded-full bg-black/[.05] dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:text-red-500">
              <Trash2 size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={chip}>
          <CalendarClock size={13} aria-hidden />
          נכנס {since(daysAgo(contact.createdAt))}
        </span>
        <span className={chip}>
          <Clock size={13} aria-hidden />
          קשר אחרון: {since(lastContact)}
        </span>
        {inStage !== null && (
          <span className={chip}>
            בשלב {inStage === 0 ? "מהיום" : `${inStage} ימים`}
          </span>
        )}
        {contact.noAnswerCount > 0 && (
          <span className={`${chip} !bg-amber-100 !text-amber-800 dark:!bg-amber-950/50 dark:!text-amber-300`}>
            <PhoneOff size={13} aria-hidden />
            {contact.noAnswerCount} ללא מענה
          </span>
        )}
      </div>
    </div>
  );
}
