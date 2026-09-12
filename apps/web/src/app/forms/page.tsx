"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { FormField } from "@/lib/types";

const FIELD_TYPES: { value: FormField["type"]; label: string }[] = [
  { value: "text", label: "טקסט" },
  { value: "phone", label: "טלפון" },
  { value: "email", label: "אימייל" },
  { value: "textarea", label: "טקסט ארוך" },
];

export default function FormsPage() {
  const { forms, deleteForm } = useStore();
  const [creating, setCreating] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">טפסי לידים</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        >
          + טופס חדש
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        טופס שאפשר להטמיע באתר או בדף נחיתה. הגשה יוצרת ליד חדש במערכת עם מקור = שם הטופס.
      </p>

      {creating && <NewFormForm onDone={() => setCreating(false)} />}

      <ul className="space-y-2">
        {forms.map((f) => (
          <li key={f.id} className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-neutral-500">{f.fields.length} שדות</p>
              </div>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() => setPreviewId(previewId === f.id ? null : f.id)}
                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline"
                >
                  {previewId === f.id ? "סגירת תצוגה מקדימה" : "תצוגה מקדימה / הטמעה"}
                </button>
                <button onClick={() => deleteForm(f.id)} className="text-neutral-400 hover:text-red-500 hover:underline">
                  מחיקה
                </button>
              </div>
            </div>
            {previewId === f.id && <FormPreview formId={f.id} />}
          </li>
        ))}
        {forms.length === 0 && <p className="text-sm text-neutral-400">אין עדיין טפסים.</p>}
      </ul>
    </div>
  );
}

function NewFormForm({ onDone }: { onDone: () => void }) {
  const { addForm } = useStore();
  const [name, setName] = useState("");
  const [fields, setFields] = useState<FormField[]>([
    { key: "name", label: "שם מלא", type: "text", required: true },
    { key: "phone", label: "טלפון", type: "phone", required: true },
  ]);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<FormField["type"]>("text");

  function addField() {
    if (!fieldLabel.trim()) return;
    const key = fieldLabel.trim().toLowerCase().replace(/\s+/g, "_");
    setFields([...fields, { key, label: fieldLabel.trim(), type: fieldType, required: false }]);
    setFieldLabel("");
  }

  function removeField(key: string) {
    setFields(fields.filter((f) => f.key !== key));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || fields.length === 0) return;
    addForm(name.trim(), fields);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
      <label className="block text-sm">
        <span className="block text-xs text-neutral-500 mb-1">שם הטופס</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          placeholder="לדוגמה: טופס יצירת קשר — קמפיין פייסבוק"
          className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
      </label>

      <div>
        <span className="block text-xs text-neutral-500 mb-1">שדות</span>
        <ul className="space-y-1 mb-2">
          {fields.map((f) => (
            <li key={f.key} className="flex items-center justify-between text-sm border border-neutral-200 dark:border-neutral-800 rounded-md px-2 py-1">
              <span>
                {f.label} <span className="text-neutral-400">({FIELD_TYPES.find((t) => t.value === f.type)?.label})</span>
              </span>
              <button type="button" onClick={() => removeField(f.key)} className="text-neutral-400 hover:text-red-500 text-xs">
                הסרה
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            value={fieldLabel}
            onChange={(e) => setFieldLabel(e.target.value)}
            placeholder="שם שדה חדש"
            className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as FormField["type"])}
            className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={addField} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספת שדה
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          יצירת טופס
        </button>
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-neutral-400">
          ביטול
        </button>
      </div>
    </form>
  );
}

function FormPreview({ formId }: { formId: string }) {
  const { forms, submitForm } = useStore();
  const form = forms.find((f) => f.id === formId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submittedName, setSubmittedName] = useState<string | null>(null);

  if (!form) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const contact = await submitForm(formId, values);
    if (contact) {
      setSubmittedName(contact.name);
      setValues({});
    }
  }

  return (
    <div className="mt-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
      <p className="text-xs text-neutral-400 mb-2">
        זו סימולציה של הטופס כפי שהיה נראה מוטמע באתר — הגשה כאן יוצרת ליד אמיתי במערכת.
      </p>
      {submittedName && (
        <p className="text-xs text-green-700 dark:text-green-400 mb-2">
          נוצר ליד: {submittedName} ✓
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-2 max-w-sm">
        {form.fields.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="block text-xs text-neutral-500 mb-1">
              {f.label}
              {f.required && " *"}
            </span>
            {f.type === "textarea" ? (
              <textarea
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                required={f.required}
                className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
            ) : (
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                required={f.required}
                dir={f.type === "phone" || f.type === "email" ? "ltr" : undefined}
                className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
            )}
          </label>
        ))}
        <button type="submit" className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          שליחה
        </button>
      </form>
    </div>
  );
}
