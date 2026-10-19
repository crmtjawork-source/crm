"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { SIGNER_FIELDS } from "@/lib/documents";
import { SectionsEditor } from "@/components/documents/SectionsEditor";
import { DocumentView } from "@/components/documents/DocumentView";
import { Sheet } from "@/components/ui/Sheet";
import { apiUpload } from "@/lib/api";
import type { DocSection, DocumentTemplate } from "@/lib/types";

const field = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

type Draft = Omit<DocumentTemplate, "id" | "position">;

const EMPTY: Draft = { name: "הצעה חדשה", title: "", accentColor: "#1e3a8a", sections: [], signerFields: [] };

export function DocumentTemplatesSettings({ isAdmin }: { isAdmin: boolean }) {
  const { documentTemplates, addDocumentTemplate } = useStore();
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  // PDF → editable sections; the agent then reviews and fixes the text.
  async function importPdf(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      const r = await apiUpload<{ title: string; sections: DocSection[] }>("/api/documents/import-pdf", file);
      const name = r.title || file.name.replace(/\.pdf$/i, "");
      setEditing(await addDocumentTemplate({ ...EMPTY, name, title: r.title || name, sections: r.sections }));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "הייבוא נכשל");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">הצעות מחיר והסכמים</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        תבניות למסמכים שהלקוח פותח מקישור, קורא וחותם עליהם אונליין. מכרטיס הליד יוצרים מהתבנית מסמך אישי (אפשר לערוך אותו לפני השליחה), שולחים
        קישור בוואטסאפ, ורואים מתי נפתח, כמה זמן נקרא ואיזה פרקים — עד החתימה.
      </p>
      <ul className="space-y-2 mb-3">
        {documentTemplates.map((t) => (
          <li key={t.id}>
            <button onClick={() => setEditing(t)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-start border border-neutral-200 dark:border-neutral-800 rounded-lg">
              <span className="truncate">{t.name}</span>
              <span className="text-xs text-neutral-400 shrink-0">{t.sections.length} פרקים</span>
            </button>
          </li>
        ))}
      </ul>
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => setEditing(await addDocumentTemplate(EMPTY))}
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            + תבנית חדשה
          </button>
          <label className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 cursor-pointer">
            {importing ? "קורא את הקובץ…" : "⬆ העלאת חוזה קיים (PDF)"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                importPdf(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {importError && <span className="text-xs text-red-500">{importError}</span>}
          <p className="w-full text-xs text-neutral-400">
            הקובץ מומר לפרקים שאפשר לערוך (כותרות, פסקאות, נקודות). כדאי לעבור על הטקסט אחרי ההמרה ולהחליף פרטים משתנים בשדות כמו{" "}
            <code dir="ltr">{"{{name}}"}</code>.
          </p>
        </div>
      ) : (
        <p className="text-xs text-amber-600">רק מנהלים יכולים לערוך תבניות.</p>
      )}
      {editing && <TemplateEditor key={editing.id} template={editing} isAdmin={isAdmin} onClose={() => setEditing(null)} />}
    </section>
  );
}

function TemplateEditor({ template, isAdmin, onClose }: { template: DocumentTemplate; isAdmin: boolean; onClose: () => void }) {
  const { updateDocumentTemplate, deleteDocumentTemplate, uploadMedia } = useStore();
  const [d, setD] = useState<Draft>(template);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  async function upload(file: File | undefined, key: "logoUrl" | "coverImageUrl") {
    if (!file) return;
    try {
      set({ [key]: await uploadMedia(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההעלאה נכשלה");
    }
  }

  async function save() {
    setError("");
    try {
      await updateDocumentTemplate(template.id, d);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <Sheet title={d.name} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">שם התבנית (פנימי)</span>
            <input value={d.name} onChange={(e) => set({ name: e.target.value })} disabled={!isAdmin} className={field} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">כותרת על השער</span>
            <input value={d.title} onChange={(e) => set({ title: e.target.value })} disabled={!isAdmin} className={field} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">צבע</span>
            <input type="color" value={d.accentColor} onChange={(e) => set({ accentColor: e.target.value })} disabled={!isAdmin} className="h-8 w-16" />
          </label>
          <div className="text-xs flex flex-wrap items-end gap-3">
            {(["logoUrl", "coverImageUrl"] as const).map((key) => (
              <label key={key} className="cursor-pointer">
                <span className="block text-neutral-500 mb-1">{key === "logoUrl" ? "לוגו" : "תמונת רקע לשער"}</span>
                <span className="inline-block px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">{d[key] ? "החלפה" : "העלאה"}</span>
                {d[key] && (
                  <button type="button" onClick={() => set({ [key]: undefined })} className="ms-1 text-neutral-400 hover:text-red-500">
                    ×
                  </button>
                )}
                <input type="file" accept="image/*" className="hidden" disabled={!isAdmin} onChange={(e) => upload(e.target.files?.[0], key)} />
              </label>
            ))}
          </div>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">תוקף (ימים מהשליחה, ריק = ללא)</span>
            <input type="number" min={1} value={d.expiryDays ?? ""} onChange={(e) => set({ expiryDays: e.target.value ? Number(e.target.value) : undefined })} disabled={!isAdmin} className={field} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">שווי עסקה ברירת מחדל (₪, לדוחות)</span>
            <input type="number" min={0} value={d.defaultValue ?? ""} onChange={(e) => set({ defaultValue: e.target.value ? Number(e.target.value) : undefined })} disabled={!isAdmin} className={field} />
          </label>
        </div>

        <div className="text-xs">
          <span className="block text-neutral-500 mb-1">פרטים שהחותם ממלא (מלבד שם מלא)</span>
          <div className="flex flex-wrap gap-3">
            {SIGNER_FIELDS.map((f) => (
              <label key={f.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={d.signerFields.includes(f.id)}
                  disabled={!isAdmin}
                  onChange={(e) => set({ signerFields: e.target.checked ? [...d.signerFields, f.id] : d.signerFields.filter((x) => x !== f.id) })}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <SectionsEditor sections={d.sections} onChange={(sections) => set({ sections })} disabled={!isAdmin} />

        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-3 sticky bottom-0 bg-white dark:bg-neutral-950 py-2">
          {isAdmin && (
            <button onClick={save} className="px-4 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              שמירה
            </button>
          )}
          <button onClick={() => setPreview(true)} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            תצוגה מקדימה
          </button>
          {saved && <span className="text-xs text-emerald-600">נשמר ✓</span>}
          {isAdmin && (
            <button
              onClick={async () => {
                if (!confirm(`למחוק את התבנית "${template.name}"? מסמכים שכבר נשלחו לא יושפעו.`)) return;
                await deleteDocumentTemplate(template.id);
                onClose();
              }}
              className="text-xs text-neutral-400 hover:text-red-500 ms-auto"
            >
              מחיקה
            </button>
          )}
        </div>
      </div>
      {preview && (
        <Sheet title="תצוגה מקדימה" onClose={() => setPreview(false)} wide>
          <DocumentView
            cover={{ title: d.title, prepared_for: "שם הלקוח", date: new Date().toLocaleDateString("en-GB"), logo_url: d.logoUrl, cover_image_url: d.coverImageUrl, accent_color: d.accentColor }}
            sections={d.sections}
          />
        </Sheet>
      )}
    </Sheet>
  );
}
