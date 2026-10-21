"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { OPS, condComplete, type AnyFilterField as FilterField, type FilterCond, type FilterOp, type LeadFilter } from "@/lib/leadFilters";

const input = "px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";
const NO_VALUE: FilterOp[] = ["empty", "not_empty", "is_true", "is_false", "today", "yesterday", "last_7", "last_30", "this_month", "last_month"];

const newId = () => Math.random().toString(36).slice(2, 10);

// Edits a copy of the filter; "הצגת תוצאות" applies it to the list.
export function LeadFilterPanel({
  fields,
  filter,
  title = "סינון לידים",
  onApply,
  onClose,
}: {
  fields: FilterField[];
  title?: string;
  filter: LeadFilter;
  onApply: (f: LeadFilter) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LeadFilter>(() => (filter.conds.length ? filter : { ...filter, conds: [blank(fields[0])] }));
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const groups = [...new Set(fields.map((f) => f.group))];

  const update = (id: string, patch: Partial<FilterCond>) => setDraft((d) => ({ ...d, conds: d.conds.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const remove = (id: string) => setDraft((d) => ({ ...d, conds: d.conds.filter((c) => c.id !== id) }));

  return (
    <Sheet title={title} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span>להציג לידים שעומדים ב</span>
          <select value={draft.match} onChange={(e) => setDraft((d) => ({ ...d, match: e.target.value as LeadFilter["match"] }))} className={input}>
            <option value="all">כל התנאים</option>
            <option value="any">לפחות תנאי אחד</option>
          </select>
        </div>

        {draft.conds.map((cond, i) => {
          const field = byKey.get(cond.field);
          return (
            <div key={cond.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {i > 0 && <span className="text-xs text-neutral-400 w-full">{draft.match === "all" ? "וגם" : "או"}</span>}
                <select
                  value={cond.field}
                  onChange={(e) => update(cond.id, { field: e.target.value, op: OPS[byKey.get(e.target.value)!.kind][0].op, values: [] })}
                  className={`${input} flex-1 min-w-40`}
                >
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {fields
                        .filter((f) => f.group === g)
                        .map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                {field && (
                  <select value={cond.op} onChange={(e) => update(cond.id, { op: e.target.value as FilterOp, values: [] })} className={input}>
                    {OPS[field.kind].map((o) => (
                      <option key={o.op} value={o.op}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                <button onClick={() => remove(cond.id)} aria-label="הסרת תנאי" className="text-neutral-400 hover:text-red-500 text-lg leading-none px-1">
                  ×
                </button>
              </div>
              {field && !NO_VALUE.includes(cond.op) && <ValueInput field={field} cond={cond} onChange={(values) => update(cond.id, { values })} />}
              {field && !condComplete(field, cond) && <p className="text-xs text-amber-600">יש לבחור ערך — תנאי ריק לא משפיע על הרשימה.</p>}
            </div>
          );
        })}

        <button
          onClick={() => setDraft((d) => ({ ...d, conds: [...d.conds, blank(fields[0])] }))}
          className="w-full text-sm py-2 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          + הוספת תנאי
        </button>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onApply(draft)}
            className="flex-1 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium"
          >
            הצגת תוצאות
          </button>
          <button onClick={() => onApply({ match: "all", conds: [] })} className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
            ניקוי הכל
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function blank(field: FilterField): FilterCond {
  return { id: newId(), field: field.key, op: OPS[field.kind][0].op, values: [] };
}

function ValueInput({ field, cond, onChange }: { field: FilterField; cond: FilterCond; onChange: (values: string[]) => void }) {
  const [q, setQ] = useState("");
  if (field.kind === "enum") {
    const options = field.options ?? [];
    const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
    const toggle = (v: string) => onChange(cond.values.includes(v) ? cond.values.filter((x) => x !== v) : [...cond.values, v]);
    if (!options.length) return <p className="text-xs text-neutral-400">אין ערכים לבחירה בשדה הזה.</p>;
    return (
      <div className="space-y-1.5">
        {options.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש ערך…" className={`${input} w-full`} />}
        <div className="max-h-48 overflow-y-auto grid sm:grid-cols-2 gap-x-3">
          {shown.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
              <input type="checkbox" checked={cond.values.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (cond.op === "between") {
    const type = field.kind === "date" ? "date" : "number";
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>מ־</span>
        <input type={type} value={cond.values[0] ?? ""} onChange={(e) => onChange([e.target.value, cond.values[1] ?? ""])} className={input} />
        <span>עד</span>
        <input type={type} value={cond.values[1] ?? ""} onChange={(e) => onChange([cond.values[0] ?? "", e.target.value])} className={input} />
      </div>
    );
  }
  return (
    <input
      type={field.kind === "number" ? "number" : "text"}
      value={cond.values[0] ?? ""}
      onChange={(e) => onChange([e.target.value])}
      placeholder="ערך…"
      className={`${input} w-full`}
    />
  );
}
