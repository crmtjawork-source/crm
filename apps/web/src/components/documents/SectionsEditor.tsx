"use client";

import { newSectionId } from "@/lib/documents";
import type { DocSection } from "@/lib/types";

const field = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";
const small = "text-xs px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 disabled:opacity-30";

// Edits a document's sections: title, subtitle and body (light markup).
export function SectionsEditor({ sections, onChange, disabled }: { sections: DocSection[]; onChange: (s: DocSection[]) => void; disabled?: boolean }) {
  const set = (i: number, patch: Partial<DocSection>) => onChange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) => {
    const next = [...sections];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500 leading-relaxed">
        עיצוב בטקסט: שורה שמתחילה ב-<code>- </code> היא נקודה, <code>1. </code> מספור, <code>## </code> כותרת משנה, ו-<code>**מודגש**</code> מודגש. שורה ריקה = פסקה
        חדשה. שדות כמו <code dir="ltr">{"{{name}}"}</code> מתמלאים לבד.
      </p>
      {sections.map((s, i) => (
        <details key={s.id} className="border border-neutral-200 dark:border-neutral-800 rounded-lg" open={!s.title}>
          <summary className="cursor-pointer px-3 py-2 text-sm flex items-center gap-2">
            <span className="text-neutral-400 text-xs w-5">{i + 1}</span>
            <span className="truncate flex-1">{s.title || "פרק חדש"}</span>
          </summary>
          <div className="px-3 pb-3 space-y-2">
            <input value={s.title} onChange={(e) => set(i, { title: e.target.value })} disabled={disabled} placeholder="כותרת הפרק" className={field} />
            <input value={s.subtitle ?? ""} onChange={(e) => set(i, { subtitle: e.target.value || undefined })} disabled={disabled} placeholder="כותרת משנה (לא חובה)" className={field} />
            <textarea value={s.body} onChange={(e) => set(i, { body: e.target.value })} disabled={disabled} rows={10} dir="auto" className={`${field} leading-relaxed`} />
            {!disabled && (
              <div className="flex gap-2">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={small}>
                  ↑ למעלה
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} className={small}>
                  ↓ למטה
                </button>
                <button type="button" onClick={() => onChange(sections.filter((_, j) => j !== i))} className="text-xs text-neutral-400 hover:text-red-500 ms-auto">
                  מחיקת הפרק
                </button>
              </div>
            )}
          </div>
        </details>
      ))}
      {!disabled && (
        <button type="button" onClick={() => onChange([...sections, { id: newSectionId(), title: "", body: "" }])} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          + פרק
        </button>
      )}
    </div>
  );
}
