"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { PLACEHOLDERS, QUICK_ACTIONS } from "@/lib/templates";
import type { MessageTemplate } from "@/lib/types";

const field = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

export function MessageTemplatesSettings({ isAdmin }: { isAdmin: boolean }) {
  const { messageTemplates, addMessageTemplate } = useStore();
  const sorted = [...messageTemplates].sort((a, b) => a.position - b.position);

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">הודעות מוכנות</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        ההודעות שהסוכנים שולחים מהוואטסאפ שלהם בלחיצה מכרטיס הליד. הודעה שמשויכת לכפתור (למשל &quot;ללא מענה — ניסיון 2&quot;) נפתחת
        אוטומטית כשלוחצים עליו. שדות כמו <code dir="ltr">{"{{first_name}}"}</code> מתמלאים לבד.
      </p>
      <details className="mb-4 text-xs text-neutral-500">
        <summary className="cursor-pointer">שדות שאפשר להשתמש בהם</summary>
        <ul className="mt-2 grid grid-cols-2 gap-1">
          {PLACEHOLDERS.map((p) => (
            <li key={p.key}>
              <code dir="ltr">{`{{${p.key}}}`}</code> — {p.label}
            </li>
          ))}
          <li>
            <code dir="ltr">{"{{field:שם שדה}}"}</code> — שדה מותאם של הליד
          </li>
        </ul>
      </details>

      <ul className="space-y-2 mb-3">
        {sorted.map((t) => (
          <TemplateRow key={t.id} template={t} isAdmin={isAdmin} taken={messageTemplates.filter((x) => x.id !== t.id).map((x) => x.quickAction)} />
        ))}
      </ul>
      {isAdmin ? (
        <button onClick={() => addMessageTemplate({ name: "הודעה חדשה", body: "" })} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          + הודעה חדשה
        </button>
      ) : (
        <p className="text-xs text-amber-600">רק מנהלים יכולים לערוך הודעות מוכנות.</p>
      )}
    </section>
  );
}

function TemplateRow({ template, isAdmin, taken }: { template: MessageTemplate; isAdmin: boolean; taken: (string | undefined)[] }) {
  const { updateMessageTemplate, deleteMessageTemplate } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [action, setAction] = useState(template.quickAction ?? "");
  const [saved, setSaved] = useState(false);
  const dirty = name !== template.name || body !== template.body || action !== (template.quickAction ?? "");

  async function save() {
    await updateMessageTemplate(template.id, { name: name.trim() || template.name, body, quickAction: action || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <li className="border border-neutral-200 dark:border-neutral-800 rounded-lg">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-start">
        <span className="truncate">{template.name}</span>
        <span className="text-xs text-neutral-400 shrink-0">{QUICK_ACTIONS.find((q) => q.id === template.quickAction)?.label ?? ""}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} className={field} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!isAdmin} rows={8} dir="auto" className={`${field} leading-relaxed`} />
          <label className="text-xs flex items-center gap-2">
            <span className="text-neutral-500">כפתור בכרטיס הליד</span>
            <select value={action} onChange={(e) => setAction(e.target.value)} disabled={!isAdmin} className="px-2 py-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent">
              <option value="">ללא (בחירה ידנית בלבד)</option>
              {QUICK_ACTIONS.map((q) => (
                <option key={q.id} value={q.id} disabled={taken.includes(q.id)}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
          {isAdmin && (
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={!dirty} className="px-3 py-1 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-40">
                שמירה
              </button>
              {saved && <span className="text-xs text-emerald-600">נשמר ✓</span>}
              <button
                onClick={() => confirm(`למחוק את "${template.name}"?`) && deleteMessageTemplate(template.id)}
                className="text-xs text-neutral-400 hover:text-red-500 ms-auto"
              >
                מחיקה
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
