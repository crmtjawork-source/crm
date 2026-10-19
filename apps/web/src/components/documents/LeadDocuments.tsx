"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { formatDuration } from "@/lib/documents";
import type { Contact, CrmDocument } from "@/lib/types";
import { WhatsAppSheet } from "@/components/leads/WhatsAppSheet";
import { NewDocumentSheet } from "./NewDocumentSheet";
import { DocumentInsights, StatusChip } from "./DocumentInsights";

// The lead card's proposals / contracts: create, send, follow.
export function LeadDocuments({ contact }: { contact: Contact }) {
  const { documents, messageTemplates } = useStore();
  const mine = documents.filter((d) => d.contactId === contact.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const open = mine.find((d) => d.id === openId);
  const sendTemplate = messageTemplates.find((t) => t.quickAction === "send_document")?.id;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-neutral-500">הצעות והסכמים</h2>
        <button onClick={() => setCreating(true)} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
          + שליחת הצעה / הסכם
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="text-xs text-neutral-400">עוד לא נשלחו מסמכים לליד הזה.</p>
      ) : (
        <ul className="space-y-1.5">
          {mine.map((d: CrmDocument) => (
            <li key={d.id}>
              <button onClick={() => setOpenId(d.id)} className="w-full flex items-center gap-2 text-sm text-start border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2">
                <span className="truncate flex-1">{d.title}</span>
                <span className="text-xs text-neutral-400 shrink-0">
                  {d.viewCount ? `${d.viewCount} צפיות · ${formatDuration(d.viewSeconds)}` : "לא נפתח"}
                </span>
                <StatusChip doc={d} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NewDocumentSheet
          contact={contact}
          onClose={() => setCreating(false)}
          onCreated={(doc) => {
            setCreating(false);
            setSending(`${window.location.origin}/d/${doc.token}`);
          }}
        />
      )}
      {open && <DocumentInsights doc={open} onClose={() => setOpenId(null)} onSend={(url) => (setOpenId(null), setSending(url))} />}
      {sending && <WhatsAppSheet contact={contact} templateId={sendTemplate} documentUrl={sending} onClose={() => setSending(null)} />}
    </section>
  );
}
