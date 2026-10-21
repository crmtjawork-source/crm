"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { LeadCol } from "@/lib/leadColumns";

// "עמודות" button + window: tick columns on/off, reorder the shown ones.
export function ColumnPicker({
  catalog,
  ids,
  onChange,
  onReset,
  isDefault,
  fixed,
}: {
  catalog: LeadCol[];
  ids: string[];
  onChange: (ids: string[]) => void;
  onReset: () => void;
  isDefault: boolean;
  fixed: string; // the always-shown first column, for the note
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const hidden = catalog.filter((c) => !ids.includes(c.id));
  const groups = [...new Set(hidden.map((c) => c.group))];
  const move = (i: number, d: number) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const small = "text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-25 px-1.5 py-0.5";

  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
        ▦ עמודות
      </button>
      {open && (
        <Sheet title="עמודות בטבלה" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <p className="text-xs text-neutral-400">העמודה &quot;{fixed}&quot; תמיד מוצגת. הבחירה נשמרת עבורך בדפדפן הזה.</p>
            <section>
              <h3 className="text-xs font-medium text-neutral-500 mb-1">מוצגות ({ids.length})</h3>
              {ids.length === 0 && <p className="text-sm text-neutral-400 py-1">אין עמודות נוספות.</p>}
              {ids.map((id, i) => (
                <div key={id} className="flex items-center gap-1 py-1 border-b border-neutral-100 dark:border-neutral-900 text-sm">
                  <span className="flex-1">{byId.get(id)?.label}</span>
                  <button className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label="הזזה למעלה">
                    ↑
                  </button>
                  <button className={small} disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label="הזזה למטה">
                    ↓
                  </button>
                  <button className={`${small} hover:!text-red-500`} onClick={() => onChange(ids.filter((x) => x !== id))} aria-label="הסתרה">
                    ×
                  </button>
                </div>
              ))}
            </section>
            {groups.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-neutral-500 mb-1">להוספה</h3>
                {groups.map((g) => (
                  <div key={g} className="mb-2">
                    <p className="text-[11px] text-neutral-400 mt-1">{g}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {hidden
                        .filter((c) => c.group === g)
                        .map((c) => (
                          <button
                            key={c.id}
                            onClick={() => onChange([...ids, c.id])}
                            className="text-xs px-2.5 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                          >
                            + {c.label}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
            {!isDefault && (
              <button onClick={onReset} className="text-xs text-neutral-400 hover:underline">
                איפוס לברירת המחדל
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
