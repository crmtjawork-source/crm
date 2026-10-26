"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { documentUrl, renderSections } from "@/lib/documents";
import { renderTemplate } from "@/lib/templates";
import type { Contact, CrmDocument, DocSection } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { SectionsEditor } from "./SectionsEditor";
import { DocumentView } from "./DocumentView";

const field = "w-full px-2 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";
const subscribe = () => () => {};

// Builds a personal document for a lead from a template: details filled in,
// editable before sending.
export function NewDocumentSheet({ contact, onClose, onCreated }: { contact: Contact; onClose: () => void; onCreated: (doc: CrmDocument) => void }) {
  const { documentTemplates, members, currentMemberId, createDocument, companySignature } = useStore();
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const me = members.find((m) => m.id === currentMemberId);
  const [templateId, setTemplateId] = useState(documentTemplates[0]?.id ?? "");
  const template = documentTemplates.find((t) => t.id === templateId);
  const ctx = useMemo(() => ({ contact, agentName: me?.name, origin, bookingToken: contact.bookingToken }), [contact, me, origin]);

  const [sections, setSections] = useState<DocSection[]>(() => (template ? renderSections(template.sections, ctx) : []));
  const [value, setValue] = useState<string>(template?.defaultValue != null ? String(template.defaultValue) : "");
  const [preparedFor, setPreparedFor] = useState(contact.name);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(id: string) {
    setTemplateId(id);
    const t = documentTemplates.find((x) => x.id === id);
    setSections(t ? renderSections(t.sections, ctx) : []);
    setValue(t?.defaultValue != null ? String(t.defaultValue) : "");
  }

  const cover = template
    ? {
        title: renderTemplate(template.title, ctx) || template.name,
        preparedFor,
        date: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()),
        logoUrl: template.logoUrl,
        coverImageUrl: template.coverImageUrl,
        accentColor: template.accentColor,
        senderName: me?.name,
        senderEmail: me?.email,
      }
    : null;

  async function create() {
    if (!template || !cover) return;
    setBusy(true);
    setError("");
    try {
      const doc = await createDocument({
        templateId: template.id,
        contactId: contact.id,
        title: cover.title,
        cover,
        sections,
        signerFields: template.signerFields,
        value: value ? Number(value) : undefined,
        expiresAt: template.expiryDays ? new Date(Date.now() + template.expiryDays * 86400000).toISOString() : undefined,
      });
      onCreated(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת המסמך נכשלה");
      setBusy(false);
    }
  }

  return (
    <Sheet title={`הצעה / הסכם ל${contact.name}`} onClose={onClose} wide={editing}>
      {documentTemplates.length === 0 ? (
        <p className="text-sm text-neutral-500">עוד אין תבניות. מוסיפים אותן בהגדרות ← הצעות מחיר והסכמים.</p>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">תבנית</span>
            <select value={templateId} onChange={(e) => pick(e.target.value)} className={field}>
              {documentTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="block text-neutral-500 mb-1">הוכן עבור</span>
              <input value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} className={field} />
            </label>
            <label className="block text-xs">
              <span className="block text-neutral-500 mb-1">שווי העסקה (₪)</span>
              <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className={field} />
            </label>
          </div>
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={() => setEditing((v) => !v)} className="text-neutral-600 dark:text-neutral-300 underline">
              {editing ? "סגירת העריכה" : "התאמת התוכן ללקוח"}
            </button>
            <button type="button" onClick={() => setPreview(true)} className="text-neutral-600 dark:text-neutral-300 underline">
              תצוגה מקדימה
            </button>
          </div>
          {editing && <SectionsEditor sections={sections} onChange={setSections} />}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={create} disabled={busy || !template} className="w-full py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50">
            {busy ? "יוצר…" : "יצירת קישור ושליחה"}
          </button>
          {origin && <p className="text-[11px] text-neutral-400 text-center">הקישור ייראה כך: {documentUrl(origin, "…")}</p>}
        </div>
      )}
      {preview && cover && (
        <Sheet title="תצוגה מקדימה" onClose={() => setPreview(false)} wide>
          <DocumentView
            cover={{ title: cover.title, prepared_for: cover.preparedFor, date: cover.date, logo_url: cover.logoUrl, cover_image_url: cover.coverImageUrl, accent_color: cover.accentColor, sender_name: cover.senderName, sender_email: cover.senderEmail }}
            sections={sections}
            companySignature={companySignature}
          />
        </Sheet>
      )}
    </Sheet>
  );
}
