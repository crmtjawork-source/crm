"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";
import type { Contact } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Write a message now, choose when it goes out; the server sends it from this
// chat's number at that time (the queued ones show on the lead's card).
export function ScheduleSheet({ contact, channelId, initialText, onClose }: { contact: Contact; channelId: string; initialText: string; onClose: () => void }) {
  const { addScheduledMessages } = useStore();
  const tomorrow9 = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  })();
  const [text, setText] = useState(initialText);
  const [when, setWhen] = useState(localInput(tomorrow9));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save() {
    if (!text.trim() || busy) return;
    const at = new Date(when);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now() + 60_000) {
      setError("צריך לבחור זמן עתידי");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { scheduled } = await apiPost<{ scheduled: Record<string, unknown>[] }>(`/api/leads/${contact.id}/schedule`, {
        channelId,
        items: [{ text: text.trim(), sendAt: at.toISOString(), label: text.trim().slice(0, 60) }],
      });
      addScheduledMessages(scheduled);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "התזמון נכשל");
    }
    setBusy(false);
  }

  return (
    <Sheet title={`הודעה מתוזמנת ל${contact.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-600">✓ ההודעה תישלח ב-{new Date(when).toLocaleString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. אפשר לראות ולבטל אותה בכרטיס הליד.</p>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            סגירה
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} dir="auto" autoFocus placeholder="ההודעה שתישלח…" className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <label className="block text-sm">
            <span className="block text-xs text-neutral-500 mb-1">מתי לשלוח</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={save} disabled={!text.trim() || busy} className="w-full py-2.5 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-50">
            {busy ? "מתזמן…" : "תזמון ההודעה"}
          </button>
        </div>
      )}
    </Sheet>
  );
}
