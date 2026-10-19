"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { FieldValue as Value } from "@/lib/objects";
import type { Contact, ObjectField } from "@/lib/types";
import { FieldValue } from "@/components/objects/FieldValue";
import { FieldInput } from "@/components/objects/FieldInput";

// Lead values live as text in contacts.fields; these convert to / from the
// typed controls.
function toValue(f: ObjectField, s: string | undefined): Value {
  if (s === undefined || s === "") return null;
  if (f.type === "number" || f.type === "currency") return Number.isFinite(Number(s.replace(/,/g, ""))) ? Number(s.replace(/,/g, "")) : s;
  if (f.type === "multi_select") return s.split(/\s*,\s*/).filter(Boolean);
  if (f.type === "checkbox") return s === "כן" || s === "true";
  return s;
}
function toText(f: ObjectField, v: Value): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (f.type === "checkbox") return v ? "כן" : "לא";
  return String(v);
}

export function LeadFieldsCard({ contact }: { contact: Contact }) {
  const { leadFields, members, updateContactFields, addFieldDef, fieldDefs } = useStore();
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  // Defined fields by group, then values with no definition (older data).
  const groups: { name: string; fields: ObjectField[] }[] = [];
  for (const f of leadFields) {
    const name = f.section ?? "";
    (groups.find((g) => g.name === name) ?? groups[groups.push({ name, fields: [] }) - 1]).fields.push(f);
  }
  const extra = Object.entries(contact.fields).filter(([k]) => !leadFields.some((f) => f.key === k));
  const hasAny = leadFields.some((f) => contact.fields[f.key]) || extra.length > 0;

  async function save() {
    if (!editing) return;
    const changed = Object.fromEntries(Object.entries(editing).filter(([k, v]) => (contact.fields[k] ?? "") !== v));
    if (Object.keys(changed).length) await updateContactFields(contact.id, changed);
    setEditing(null);
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-neutral-500">פרטים נוספים</h2>
        {!editing ? (
          <button onClick={() => setEditing({ ...contact.fields })} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
            עריכה
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={save} className="text-xs px-2 py-1 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              שמירה
            </button>
            <button onClick={() => setEditing(null)} className="text-xs text-neutral-500">
              ביטול
            </button>
          </div>
        )}
      </div>
      {!hasAny && !editing && <p className="text-xs text-neutral-400">אין פרטים נוספים.</p>}
      <div className="space-y-4">
        {groups.map((g) => {
          const shown = editing ? g.fields : g.fields.filter((f) => contact.fields[f.key]);
          if (!shown.length) return null;
          return (
            <div key={g.name || "main"}>
              {g.name && <h3 className="text-xs text-neutral-400 mb-1">{g.name}</h3>}
              <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 border border-neutral-200 dark:border-neutral-800 rounded-md p-3">
                {shown.map((f) => (
                  <div key={f.id} className={f.type === "long_text" ? "sm:col-span-2" : ""}>
                    <dt className="text-xs text-neutral-500">{f.label}</dt>
                    <dd className="text-sm">
                      {editing ? (
                        <FieldInput field={f} value={toValue(f, editing[f.key])} onChange={(v) => setEditing((e) => ({ ...e!, [f.key]: toText(f, v) }))} />
                      ) : (
                        <FieldValue field={f} value={toValue(f, contact.fields[f.key])} members={members} />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
        {extra.length > 0 && (
          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 border border-neutral-200 dark:border-neutral-800 rounded-md p-3">
            {extra.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-neutral-500">{k}</dt>
                <dd className="text-sm">
                  {editing ? (
                    <input value={editing[k] ?? ""} onChange={(e) => setEditing((x) => ({ ...x!, [k]: e.target.value }))} className="w-full px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
                  ) : (
                    <span className="whitespace-pre-wrap">{v}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {editing && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newKey.trim()) return;
            if (!fieldDefs.includes(newKey.trim())) await addFieldDef(newKey.trim());
            setEditing((x) => ({ ...x!, [newKey.trim()]: newValue.trim() }));
            setNewKey("");
            setNewValue("");
          }}
          className="flex gap-2 mt-3"
        >
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="שדה חדש (שם)" className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="ערך" className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
      )}
    </section>
  );
}
