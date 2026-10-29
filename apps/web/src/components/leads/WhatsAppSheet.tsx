"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";
import { useSendChannels } from "@/lib/useMyGateway";
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
  documentUrl,
  onClose,
  onOpened,
}: {
  contact: Contact;
  appointment?: Appointment;
  templateId?: string;
  documentUrl?: string; // fills {{document_link}}

  onClose: () => void;
  onOpened?: () => void;
}) {
  const { messageTemplates, members, currentMemberId, addNote } = useStore();
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const agentName = members.find((m) => m.id === currentMemberId)?.name;
  const ctx = useMemo(
    () => ({ contact, appointment, agentName, origin, bookingToken: contact.bookingToken, documentUrl }),
    [contact, appointment, agentName, origin, documentUrl]
  );

  const [selected, setSelected] = useState(templateId ?? "");
  const template = messageTemplates.find((t) => t.id === selected);
  const [text, setText] = useState(() => (template ? renderTemplate(template.body, ctx) : documentUrl ? `היי ${contact.name.split(" ")[0]}, מצרף כאן את המסמך לעיון ולחתימה:\n${documentUrl}` : ""));
  // Send from my own WhatsApp or the business number.
  const { mine, all: senders } = useSendChannels();
  const canSendDirect = senders.length > 0;
  const [senderId, setSenderId] = useState<string>("");
  // Messages go from the agent's own number. If it isn't connected, the company number is used only when the agent explicitly chooses it.
  const sender = senders.find((c) => c.id === senderId) ?? mine;
  const senderLabel = (c: (typeof senders)[number]) => (c.ownerMembershipId ? "הוואטסאפ שלי" : c.name || "מספר העסק");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function sendNow() {
    if (!text.trim() && !template?.attachment) return;
    setSending(true);
    setError("");
    try {
      await apiPost(`/api/leads/${contact.id}/whatsapp`, { text, templateId: selected || undefined, channelId: sender?.id });
      onOpened?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השליחה נכשלה");
      setSending(false);
    }
  }

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
          {template?.attachment && (
            <p className="text-xs text-neutral-500">
              📎 מצורף/ת {{ image: "תמונה", video: "סרטון", gif: "גיף", document: "קובץ", voice: "הקלטה" }[template.attachment.type]}
              {canSendDirect ? " — יישלח יחד עם ההודעה." : " — בפתיחה בוואטסאפ צריך לצרף ידנית: "}
              {!canSendDirect && (
                <a href={template.attachment.url} target="_blank" rel="noreferrer" className="underline">
                  הורדת הקובץ
                </a>
              )}
            </p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {canSendDirect && !sender ? (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2 text-sm">
              <p className="text-amber-800 dark:text-amber-300">הוואטסאפ האישי שלך לא מחובר, ולכן לא נשלח אוטומטית. אפשר לחבר אותו (הודעות הליד יוצאו מהמספר שלך), או לבחור במפורש לשלוח ממספר החברה.</p>
              <div className="flex flex-wrap gap-2">
                <a href="/my-whatsapp" className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs">חיבור הוואטסאפ שלי</a>
                {senders.map((c) => (
                  <button key={c.id} type="button" onClick={() => setSenderId(c.id)} className="px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs">
                    שליחה מ{c.name || "מספר העסק"}
                  </button>
                ))}
              </div>
            </div>
          ) : canSendDirect ? (
            <>
              {senders.length > 1 && (
                <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-sm">
                  {senders.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSenderId(c.id)}
                      className={`flex-1 py-1.5 ${sender?.id === c.id ? "bg-emerald-600 text-white" : ""}`}
                    >
                      {senderLabel(c)}
                      {c.displayPhone && <span className="block text-[10px] opacity-75" dir="ltr">+{c.displayPhone}</span>}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={sendNow} disabled={sending || (!text.trim() && !template?.attachment)} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
                {sending ? "שולח…" : `שליחה עכשיו מ${sender ? (sender.ownerMembershipId ? "הוואטסאפ שלי" : "מספר העסק") : "הוואטסאפ"}`}
              </button>
              <button onClick={open} className="w-full text-xs text-neutral-500 hover:underline">
                או פתיחה בוואטסאפ (למשל כדי לצרף קובץ)
              </button>
            </>
          ) : (
            <>
              <button onClick={open} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
                פתיחה בוואטסאפ
              </button>
              <p className="text-xs text-neutral-400 text-center">ההודעה תיפתח בוואטסאפ שלך, מוכנה לשליחה. חיבור הוואטסאפ בהגדרות ישלח הודעות לבד.</p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
