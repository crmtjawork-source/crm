"use client";

import { Suspense, useState } from "react";
import { useStore } from "@/lib/store";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { MessageTemplatesSettings } from "@/components/settings/MessageTemplatesSettings";
import { DocumentTemplatesSettings } from "@/components/settings/DocumentTemplatesSettings";
import { PersonalWhatsAppSettings } from "@/components/settings/PersonalWhatsAppSettings";
import { PushSettings } from "@/components/settings/PushSettings";
import { GoogleCalendarSettings } from "@/components/settings/GoogleCalendarSettings";
import { LeadStatusesSettings } from "@/components/settings/LeadStatusesSettings";

export default function SettingsPage() {
  const { fieldDefs, addFieldDef, removeFieldDef, members, currentMemberId } = useStore();
  const isAdmin = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const [newField, setNewField] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newField.trim();
    if (!name) return;
    addFieldDef(name);
    setNewField("");
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">הגדרות</h1>
      <PushSettings />
      <Suspense>
        <GoogleCalendarSettings />
      </Suspense>
      <PersonalWhatsAppSettings isAdmin={isAdmin} />
      <LeadStatusesSettings isAdmin={isAdmin} />
      <MessageTemplatesSettings isAdmin={isAdmin} />
      <DocumentTemplatesSettings isAdmin={isAdmin} />
      <IntegrationsSettings />

      <h2 className="text-base font-semibold mb-1">שדות מותאמים אישית</h2>
      <p className="text-sm text-neutral-500 mb-6">
        שמות שדות מותאמים אישית. הגדרה כאן גורמת לשם להופיע כהצעה כשמוסיפים שדה לליד, כדי שלא ייווצרו כפילויות כמו &quot;תקציב&quot; ו&quot;Budget&quot;.
      </p>

      <ul className="space-y-2 mb-4">
        {fieldDefs.map((f) => (
          <li key={f} className="flex items-center justify-between border border-neutral-200 dark:border-neutral-800 rounded-md px-3 py-2 text-sm">
            {f}
            <button onClick={() => removeFieldDef(f)} className="text-neutral-400 hover:text-red-500 text-xs">
              הסרה מהרשימה
            </button>
          </li>
        ))}
        {fieldDefs.length === 0 && <p className="text-sm text-neutral-400">אין עדיין שדות מוגדרים.</p>}
      </ul>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newField}
          onChange={(e) => setNewField(e.target.value)}
          placeholder="שם שדה חדש"
          className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          הוספה
        </button>
      </form>

      <p className="text-xs text-neutral-400 mt-6">
        הסרה מהרשימה לא מוחקת ערכים קיימים אצל לידים — רק מפסיקה להציע את השם הזה כברירת מחדל.
      </p>
    </div>
  );
}
