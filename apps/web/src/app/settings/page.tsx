"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { fieldDefs, addFieldDef, removeFieldDef } = useStore();
  const [newField, setNewField] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newField.trim();
    if (!name) return;
    addFieldDef(name);
    setNewField("");
  }

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-bold mb-1">הגדרות</h1>
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
