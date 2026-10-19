"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { FIELD_TYPES, newKey, OBJECT_PRESETS, OPTION_COLORS } from "@/lib/objects";
import type { FieldOption, ObjectField, ObjectType } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";

const input = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";
const btn = "px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800";

// Lets a business define its own record types (clients, properties,
// projects…) with fields, option lists and stages — no code.
export function ObjectsSettings({ isAdmin }: { isAdmin: boolean }) {
  const { objectTypes } = useStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = objectTypes.find((t) => t.id === editingId);

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">אובייקטים ושדות</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        מסכים משלכם מעבר ללידים — לקוחות, נכסים, פרויקטים, רכבים, מנויים או כל דבר אחר. לכל אובייקט מגדירים שדות (טקסט, מספר, תאריך, רשימת
        בחירה, קישור לרשומה אחרת…), שלבים לתצוגת לוח, והוא מופיע בתפריט.
      </p>
      <ul className="space-y-2 mb-3">
        {objectTypes.map((t) => (
          <li key={t.id} className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-sm">
            <span>{t.icon}</span>
            <Link href={`/o/${t.id}`} className="font-medium hover:underline">
              {t.name}
            </Link>
            <span className="text-xs text-neutral-400">{t.fields.length} שדות</span>
            {isAdmin && (
              <button onClick={() => setEditingId(t.id)} className="text-xs text-neutral-500 hover:underline ms-auto">
                עריכת שדות
              </button>
            )}
          </li>
        ))}
      </ul>
      {isAdmin ? (
        <button onClick={() => setCreating(true)} className={btn}>
          + אובייקט חדש
        </button>
      ) : (
        <p className="text-xs text-amber-600">רק מנהלים יכולים להגדיר אובייקטים.</p>
      )}
      {creating && <CreateObject onClose={() => setCreating(false)} onCreated={(t) => (setCreating(false), setEditingId(t.id))} />}
      {editing && <ObjectEditor type={editing} onClose={() => setEditingId(null)} />}
    </section>
  );
}

function CreateObject({ onClose, onCreated }: { onClose: () => void; onCreated: (t: ObjectType) => void }) {
  const { addObjectType } = useStore();
  const [preset, setPreset] = useState(OBJECT_PRESETS[1]);
  const [name, setName] = useState(preset.name);
  const [singular, setSingular] = useState(preset.singular);
  const [icon, setIcon] = useState(preset.icon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(id: string) {
    const p = OBJECT_PRESETS.find((x) => x.id === id)!;
    setPreset(p);
    setName(p.name);
    setSingular(p.singular);
    setIcon(p.icon);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !singular.trim()) return setError("צריך שם ברבים ושם ליחיד");
    setBusy(true);
    try {
      const t = await addObjectType({ name: name.trim(), singular: singular.trim(), icon: icon || undefined, titleField: preset.titleKey, stageField: preset.stageKey, fields: preset.fields });
      onCreated(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "היצירה נכשלה");
      setBusy(false);
    }
  }

  return (
    <Sheet title="אובייקט חדש" onClose={onClose}>
      <form onSubmit={create} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {OBJECT_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => pick(p.id)} className={`${btn} ${preset.id === p.id ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>
              {p.icon} {p.name || "ריק"}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-400">נקודת התחלה בלבד — אפשר לשנות כל שדה אחר כך.</p>
        <div className="grid grid-cols-[4rem_1fr_1fr] gap-2">
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">אייקון</span>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={`${input} text-center`} maxLength={4} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">שם (רבים)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: נכסים" className={input} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">שם (יחיד)</span>
            <input value={singular} onChange={(e) => setSingular(e.target.value)} placeholder="למשל: נכס" className={input} />
          </label>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm disabled:opacity-50">
          {busy ? "יוצר…" : "יצירה"}
        </button>
      </form>
    </Sheet>
  );
}

function ObjectEditor({ type, onClose }: { type: ObjectType; onClose: () => void }) {
  const { updateObjectType, deleteObjectType, saveObjectField, deleteObjectField } = useStore();
  const [fieldOpen, setFieldOpen] = useState<ObjectField | "new" | null>(null);
  const selects = type.fields.filter((f) => f.type === "select");

  async function move(f: ObjectField, by: number) {
    const list = [...type.fields];
    const i = list.findIndex((x) => x.id === f.id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((x, pos) => (x.position !== pos ? saveObjectField({ ...x, position: pos }) : null)));
  }

  return (
    <Sheet title={`${type.icon ?? ""} ${type.name}`} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="grid sm:grid-cols-[4rem_1fr_1fr] gap-2">
          <input defaultValue={type.icon} onBlur={(e) => updateObjectType(type.id, { icon: e.target.value || undefined })} className={`${input} text-center`} maxLength={4} />
          <input defaultValue={type.name} onBlur={(e) => e.target.value.trim() && updateObjectType(type.id, { name: e.target.value.trim() })} className={input} />
          <input defaultValue={type.singular} onBlur={(e) => e.target.value.trim() && updateObjectType(type.id, { singular: e.target.value.trim() })} className={input} />
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-xs">
          <label>
            <span className="block text-neutral-500 mb-1">שדה הכותרת (השם של כל רשומה)</span>
            <select value={type.titleField ?? ""} onChange={(e) => updateObjectType(type.id, { titleField: e.target.value || undefined })} className={input}>
              {type.fields
                .filter((f) => ["text", "phone", "email", "number"].includes(f.type))
                .map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">שדה השלבים (פס שלבים + תצוגת לוח)</span>
            <select value={type.stageField ?? ""} onChange={(e) => updateObjectType(type.id, { stageField: e.target.value || undefined })} className={input}>
              <option value="">ללא</option>
              {selects.map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">שדות</h3>
            <button onClick={() => setFieldOpen("new")} className={btn}>
              + שדה
            </button>
          </div>
          <ul className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-900">
            {type.fields.map((f, i) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex flex-col text-[10px] text-neutral-400">
                  <button onClick={() => move(f, -1)} disabled={i === 0} className="disabled:opacity-20">
                    ▲
                  </button>
                  <button onClick={() => move(f, 1)} disabled={i === type.fields.length - 1} className="disabled:opacity-20">
                    ▼
                  </button>
                </div>
                <button onClick={() => setFieldOpen(f)} className="flex-1 text-start">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                  <span className="text-xs text-neutral-400 ms-2">
                    {FIELD_TYPES.find((x) => x.id === f.type)?.label}
                    {f.section && ` · ${f.section}`}
                    {f.showInList && " · בטבלה"}
                    {f.key === type.titleField && " · כותרת"}
                    {f.key === type.stageField && " · שלבים"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={async () => {
            if (!confirm(`למחוק את "${type.name}" וכל הרשומות שבו? אי אפשר לשחזר.`)) return;
            await deleteObjectType(type.id);
            onClose();
          }}
          className="text-xs text-neutral-400 hover:text-red-500"
        >
          מחיקת האובייקט
        </button>
      </div>
      {fieldOpen && (
        <FieldEditor
          type={type}
          field={fieldOpen === "new" ? null : fieldOpen}
          onClose={() => setFieldOpen(null)}
          onSave={async (f) => {
            await saveObjectField(f);
            setFieldOpen(null);
          }}
          onDelete={async (f) => {
            await deleteObjectField(f);
            setFieldOpen(null);
          }}
        />
      )}
    </Sheet>
  );
}

export function FieldEditor({
  type,
  field,
  onClose,
  onSave,
  onDelete,
  forLeads,
}: {
  type: ObjectType;
  field: ObjectField | null;
  onClose: () => void;
  onSave: (f: Omit<ObjectField, "id"> & { id?: string }) => Promise<void>;
  onDelete: (f: ObjectField) => Promise<void>;
  forLeads?: boolean; // lead fields: no relations, name fixed once created
}) {
  const { objectTypes } = useStore();
  const [f, setF] = useState<Omit<ObjectField, "id"> & { id?: string }>(
    field ?? { objectTypeId: type.id, key: newKey(), label: "", type: "text", options: [], required: false, showInList: false, position: type.fields.length }
  );
  const [error, setError] = useState("");
  const set = (patch: Partial<ObjectField>) => setF((x) => ({ ...x, ...patch }));
  const sections = [...new Set(type.fields.map((x) => x.section).filter(Boolean))] as string[];
  const hasOptions = f.type === "select" || f.type === "multi_select";

  const setOption = (i: number, patch: Partial<FieldOption>) => set({ options: f.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  async function save() {
    if (!f.label.trim()) return setError("צריך שם לשדה");
    if (hasOptions && !f.options.some((o) => o.label.trim())) return setError("צריך לפחות אפשרות אחת");
    if (f.type === "relation" && !f.relationTypeId) return setError("בחרו לאיזה אובייקט השדה מקשר");
    try {
      await onSave({ ...f, label: f.label.trim(), options: f.options.filter((o) => o.label.trim()) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <Sheet title={field ? `עריכת "${field.label}"` : "שדה חדש"} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">שם השדה</span>
          <input value={f.label} onChange={(e) => set({ label: e.target.value })} className={input} autoFocus disabled={forLeads && Boolean(field)} />
        </label>
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">סוג</span>
          <select value={f.type} onChange={(e) => set({ type: e.target.value as ObjectField["type"] })} className={input} disabled={Boolean(field) && !forLeads}>
            {FIELD_TYPES.filter((t) => !forLeads || !["relation", "contact"].includes(t.id)).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {field && !forLeads && <span className="text-neutral-400">אי אפשר לשנות סוג של שדה קיים (הנתונים שמורים לפיו).</span>}
        </label>
        {f.type === "relation" && (
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">מקשר אל</span>
            <select value={f.relationTypeId ?? ""} onChange={(e) => set({ relationTypeId: e.target.value || undefined })} className={input}>
              <option value="">בחירה…</option>
              {objectTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {hasOptions && (
          <div className="text-xs">
            <span className="block text-neutral-500 mb-1">אפשרויות (לפי הסדר)</span>
            <ul className="space-y-1">
              {f.options.map((o, i) => (
                <li key={o.value} className="flex items-center gap-1">
                  <input type="color" value={o.color ?? OPTION_COLORS[0]} onChange={(e) => setOption(i, { color: e.target.value })} className="h-7 w-8" />
                  <input value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} className={input} />
                  <button type="button" onClick={() => i > 0 && set({ options: f.options.map((x, j) => (j === i - 1 ? f.options[i] : j === i ? f.options[i - 1] : x)) })} className="px-1 text-neutral-400">
                    ▲
                  </button>
                  <button type="button" onClick={() => set({ options: f.options.filter((_, j) => j !== i) })} className="px-1 text-neutral-400 hover:text-red-500">
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => set({ options: [...f.options, { value: newKey(), label: "", color: OPTION_COLORS[(f.options.length + 1) % OPTION_COLORS.length] }] })}
              className="mt-1 text-xs underline text-neutral-500"
            >
              + אפשרות
            </button>
          </div>
        )}
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">קבוצה בכרטיס (לא חובה)</span>
          <input value={f.section ?? ""} onChange={(e) => set({ section: e.target.value || undefined })} list="field-sections" className={input} placeholder="למשל: העדפות חיפוש" />
          <datalist id="field-sections">
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div className="flex gap-4 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={f.required} onChange={(e) => set({ required: e.target.checked })} /> חובה
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={f.showInList} onChange={(e) => set({ showInList: e.target.checked })} /> עמודה בטבלה
          </label>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-3">
          <button onClick={save} className="px-4 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            שמירה
          </button>
          {field && field.key !== type.titleField && (
            <button
              onClick={() => confirm(`למחוק את השדה "${field.label}"? הערכים שלו יישארו שמורים ברשומות אבל לא יוצגו.`) && onDelete(field)}
              className="text-xs text-neutral-400 hover:text-red-500 ms-auto"
            >
              מחיקת השדה
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
