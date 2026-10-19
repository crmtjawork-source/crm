"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { FIELD_TYPES } from "@/lib/objects";
import type { ObjectField, ObjectType } from "@/lib/types";
import { FieldEditor } from "./ObjectsSettings";

// The lead card's fields: type (list, number, date…), options, order, groups.
export function LeadFieldsSettings({ isAdmin }: { isAdmin: boolean }) {
  const { leadFields, saveLeadField, removeFieldDef } = useStore();
  const [open, setOpen] = useState<ObjectField | "new" | null>(null);
  const pseudo: ObjectType = { id: "contact", name: "לידים", singular: "ליד", position: 0, fields: leadFields };

  async function move(f: ObjectField, by: number) {
    const list = [...leadFields];
    const i = list.findIndex((x) => x.id === f.id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((x, pos) => (x.position !== pos ? saveLeadField({ ...x, position: pos }) : null)));
  }

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">שדות בכרטיס הליד</h2>
      <p className="text-sm text-neutral-500 mb-3">שדות נוספים לכל ליד: רשימת בחירה עם צבעים, מספר, תאריך, טקסט ועוד, בקבוצות ובסדר שתבחרו.</p>
      <ul className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-900 mb-3 text-sm">
        {leadFields.map((f, i) => (
          <li key={f.id} className="flex items-center gap-2 px-3 py-2">
            {isAdmin && (
              <div className="flex flex-col text-[10px] text-neutral-400">
                <button onClick={() => move(f, -1)} disabled={i === 0} className="disabled:opacity-20">
                  ▲
                </button>
                <button onClick={() => move(f, 1)} disabled={i === leadFields.length - 1} className="disabled:opacity-20">
                  ▼
                </button>
              </div>
            )}
            <button onClick={() => isAdmin && setOpen(f)} className="flex-1 text-start">
              {f.label}
              <span className="text-xs text-neutral-400 ms-2">
                {FIELD_TYPES.find((x) => x.id === f.type)?.label}
                {f.section && ` · ${f.section}`}
              </span>
            </button>
          </li>
        ))}
        {leadFields.length === 0 && <li className="px-3 py-2 text-neutral-400">אין עדיין שדות.</li>}
      </ul>
      {isAdmin && (
        <button onClick={() => setOpen("new")} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          + שדה
        </button>
      )}
      {open && (
        <FieldEditor
          type={pseudo}
          field={open === "new" ? null : open}
          forLeads
          onClose={() => setOpen(null)}
          onSave={async (f) => {
            await saveLeadField(f);
            setOpen(null);
          }}
          onDelete={async (f) => {
            await removeFieldDef(f.key);
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
