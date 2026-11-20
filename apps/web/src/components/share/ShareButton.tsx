"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { ShareSheet } from "./ShareSheet";
import { WhatsAppSheet } from "@/components/leads/WhatsAppSheet";
import type { Contact, CrmRecord, ObjectType } from "@/lib/types";

// "שיתוף עם לקוח" — opens the share builder; "send on WhatsApp" opens the
// regular WhatsApp sheet with the link prefilled (the agent still presses send).
export function ShareButton({ record, type, contact, className }: { record: CrmRecord; type: ObjectType; contact?: Contact; className?: string }) {
  const { contacts } = useStore();
  const [open, setOpen] = useState(false);
  const [wa, setWa] = useState<string | null>(null);
  const lead = contact ?? contacts.find((c) => c.id === record.contactId);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? "px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800"}>
        🔗 שיתוף עם לקוח
      </button>
      {open && !wa && <ShareSheet record={record} type={type} onClose={() => setOpen(false)} onWhatsApp={lead ? (t) => setWa(t.replace(/^היי,/, `היי ${lead.name.split(" ")[0]},`)) : undefined} />}
      {wa !== null && lead && <WhatsAppSheet contact={lead} initialText={wa} onClose={() => (setWa(null), setOpen(false))} />}
    </>
  );
}
