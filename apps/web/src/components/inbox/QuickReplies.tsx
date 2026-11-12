"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { renderTemplate } from "@/lib/templates";
import type { Contact } from "@/lib/types";

// Ready-made messages to drop into the composer: typed after "/" (filters as
// you type) or opened with the ⚡ button. Picking one fills the text with the
// lead's details already in it — nothing is sent until the agent sends.
export function QuickReplies({ query, contact, fallbackName, onPick, onClose }: { query: string; contact?: Contact; fallbackName: string; onPick: (text: string) => void; onClose: () => void }) {
  const { messageTemplates, members, currentMemberId } = useStore();
  const agentName = members.find((m) => m.id === currentMemberId)?.name;
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...messageTemplates]
      .sort((a, b) => a.position - b.position)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
  }, [messageTemplates, query]);
  const who = contact ?? ({ name: fallbackName, fields: {}, tags: [] } as unknown as Contact);

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-900 text-xs text-neutral-500">
        <span>תגובות מוכנות</span>
        <button type="button" onClick={onClose} aria-label="סגירה" className="text-lg leading-none px-1">
          ×
        </button>
      </div>
      {list.length === 0 && <p className="px-3 py-3 text-sm text-neutral-400">אין הודעה מוכנה שמתאימה.</p>}
      {list.map((t) => {
        const text = renderTemplate(t.body, { contact: who, agentName });
        return (
          <button key={t.id} type="button" onClick={() => onPick(text)} className="w-full text-start px-3 py-2 border-b last:border-b-0 border-neutral-100 dark:border-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            <span className="block text-sm font-medium">{t.name}</span>
            <span className="block text-xs text-neutral-500 truncate">{text}</span>
          </button>
        );
      })}
    </div>
  );
}
