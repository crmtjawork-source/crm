"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { renderTemplate, whatsappLink } from "@/lib/templates";
import type { Appointment, Contact } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";

const subscribe = () => () => {};

// Pick a ready-made message (or write one), adjust it, and open it in the
// agent's own WhatsApp. The send itself happens in WhatsApp, so the timeline
// records that the message was opened for sending.
export function WhatsAppSheet({
  contact,
  appointment,
  templateId,
  onClose,
  onOpened,
}: {
  contact: Contact;
  appointment?: Appointment;
  templateId?: string;
  onClose: () => void;
  onOpened?: () => void;
}) {
  const { messageTemplates, members, currentMemberId, addNote } = useStore();
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const agentName = members.find((m) => m.id === currentMemberId)?.name;
  const ctx = useMemo(() => ({ contact, appointment, agentName, origin, bookingToken: contact.bookingToken }), [contact, appointment, agentName, origin]);

  const [selected, setSelected] = useState(templateId ?? "");
  const template = messageTemplates.find((t) => t.id === selected);
  const [text, setText] = useState(() => (template ? renderTemplate(template.body, ctx) : ""));

  function choose(id: string) {
    setSelected(id);
    const t = messageTemplates.find((x) => x.id === id);
    setText(t ? renderTemplate(t.body, ctx) : "");
  }

  const link = whatsappLink(contact.phone, text);

  async function open() {
    if (!link) return;
    window.open(link, "_blank", "noopener");
    await addNote(contact.id, `💬 נפתחה הודעת וואטסאפ${agentName ? ` אצל ${agentName}` : ""}: ${template?.name ?? "הודעה חופשית"}\n${text}`);
    onOpened?.();
    onClose();
  }

  const sorted = [...messageTemplates].sort((a, b) => a.position - b.position);

  return (
    <Sheet title={`וואטסאפ ל${contact.name}`} onClose={onClose}>
      {!contact.phone ? (
        <p className="text-sm text-red-500">לליד אין מספר טלפון.</p>
      ) : (
        <div className="space-y-3">
          <select value={selected} onChange={(e) => choose(e.target.value)} className="w-full px-2 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent">
            <option value="">הודעה חופשית</option>
            {sorted.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            dir="auto"
            placeholder="כתיבת הודעה…"
            className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent leading-relaxed"
          />
          {/\{\{[^}]+\}\}/.test(text) && <p className="text-xs text-amber-600">יש בהודעה שדות שלא התמלאו — כדאי לבדוק לפני השליחה.</p>}
          <button onClick={open} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
            פתיחה בוואטסאפ
          </button>
          <p className="text-xs text-neutral-400 text-center">ההודעה תיפתח בוואטסאפ שלך, מוכנה לשליחה.</p>
        </div>
      )}
    </Sheet>
  );
}
