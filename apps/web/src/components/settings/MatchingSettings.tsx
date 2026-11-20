"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useMatchingConfig } from "@/lib/useMatchingConfig";
import { DEFAULT_MATCHING, MATCH_STATUS_LABELS, type MatchingConfig } from "@/lib/matching";
import { OPTION_COLORS, newKey } from "@/lib/objects";
import type { ObjectField, ObjectType } from "@/lib/types";

const input = "w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent";
const NUMERIC: ObjectField["type"][] = ["number", "currency"];

export function MatchingSettings({ isAdmin }: { isAdmin: boolean }) {
  const { objectTypes, saveObjectField } = useStore();
  const { config, ready, available, save } = useMatchingConfig();
  const [edited, setDraft] = useState<MatchingConfig | null>(null);
  const [msg, setMsg] = useState("");
  const draft = edited ?? (ready ? config : DEFAULT_MATCHING);

  const propType = objectTypes.find((t) => t.id === draft.propertyTypeId);
  const clientType = objectTypes.find((t) => t.id === draft.clientTypeId);
  const stage = propType?.fields.find((f) => f.key === propType.stageField && f.type === "select");
  const set = (patch: Partial<MatchingConfig>) => setDraft(() => ({ ...draft, ...patch }));
  const setF = (patch: Partial<MatchingConfig["formula"]>) => setDraft(() => ({ ...draft, formula: { ...draft.formula, ...patch } }));
  const setP = (patch: Partial<MatchingConfig["property"]>) => setDraft(() => ({ ...draft, property: { ...draft.property, ...patch } }));
  const setC = (patch: Partial<MatchingConfig["client"]>) => setDraft(() => ({ ...draft, client: { ...draft.client, ...patch } }));

  if (!available) return <p className="text-sm text-amber-600">הגדרות ההתאמה דורשות עדכון מסד נתונים (מיגרציה 20261120100000_matching_config) שעדיין לא הורצה.</p>;

  const fieldSelect = (type: ObjectType | undefined, value: string | undefined, onChange: (v: string | undefined) => void, kinds?: ObjectField["type"][]) => (
    <select value={value ?? ""} disabled={!isAdmin || !type} onChange={(e) => onChange(e.target.value || undefined)} className={input}>
      <option value="">— לא מוגדר —</option>
      {type?.fields.filter((f) => !kinds || kinds.includes(f.type)).map((f) => (
        <option key={f.id} value={f.key}>
          {f.label}
        </option>
      ))}
    </select>
  );
  const row = (label: string, el: React.ReactNode, hint?: string) => (
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      {el}
      {hint && <span className="text-[11px] text-neutral-400">{hint}</span>}
    </label>
  );

  async function addDefaultStatuses() {
    if (!stage) return;
    const have = new Set(stage.options.map((o) => o.label));
    const add = MATCH_STATUS_LABELS.filter((l) => !have.has(l));
    if (!add.length) return setMsg("שלושת הסטטוסים כבר קיימים.");
    await saveObjectField({ ...stage, options: [...stage.options, ...add.map((label, i) => ({ value: newKey(), label, color: OPTION_COLORS[(stage.options.length + i) % OPTION_COLORS.length] }))] });
    setMsg(`נוספו: ${add.join(", ")}. סמנו מטה אילו מהם לא מוצעים להתאמה.`);
  }

  async function onSave() {
    try {
      await save(draft);
      setMsg("נשמר.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "השמירה נכשלה");
    }
  }

  const num = (v: number, on: (n: number) => void, step = "any") => (
    <input type="number" step={step} min={0} value={v} disabled={!isAdmin} onChange={(e) => on(Number(e.target.value))} className={input} />
  );

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-neutral-500">מציע לכל נכס את הלקוחות שיכולת התזרים שלהם מתאימה, ולכל לקוח את הנכסים המתאימים. בוחרים אילו אובייקטים הם ה״נכס״ וה״לקוח״ ובאילו שדות נמצאים הנתונים.</p>

      <section className="grid sm:grid-cols-2 gap-3">
        {row("אובייקט הנכסים", <select value={draft.propertyTypeId ?? ""} disabled={!isAdmin} onChange={(e) => set({ propertyTypeId: e.target.value || undefined, property: { excludedStatuses: [] } })} className={input}>
          <option value="">— בחירה —</option>
          {objectTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>)}
        {row("אובייקט הלקוחות", <select value={draft.clientTypeId ?? ""} disabled={!isAdmin} onChange={(e) => set({ clientTypeId: e.target.value || undefined, client: {} })} className={input}>
          <option value="">— בחירה —</option>
          {objectTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>)}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">נוסחת המימון</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {row("אחוז מימון מהמחיר המבוקש", num(draft.formula.ltv, (n) => setF({ ltv: n }), "0.01"), "ברירת מחדל 0.75")}
          {row("גודל יחידה (₪)", num(draft.formula.unitSize, (n) => setF({ unitSize: n })), "ההלוואה מחולקת ליחידות בגודל הזה (ברירת מחדל 100,000)")}
          {row("תשלום חודשי ליחידה (₪)", num(draft.formula.perUnit, (n) => setF({ perUnit: n })), "ברירת מחדל 525")}
          {row("חריגה מותרת מיכולת הלקוח", num(draft.formula.tolerance, (n) => setF({ tolerance: n }), "0.01"), "0.10 = עד 10% מעל")}
        </div>
        <p className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900 rounded-lg p-2">
          תשלום חודשי = מחיר מבוקש × {draft.formula.ltv} ÷ {draft.formula.unitSize.toLocaleString("he-IL")} × {draft.formula.perUnit}. תזרים = שכירות − תשלום חודשי. נכס מתאים כשהתזרים השלילי לא עולה על יכולת הלקוח × {1 + draft.formula.tolerance}.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">שדות הנכס</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {row("מחיר מבוקש", fieldSelect(propType, draft.property.priceKey, (v) => setP({ priceKey: v }), NUMERIC))}
          {row("שכירות חודשית צפויה", fieldSelect(propType, draft.property.rentKey, (v) => setP({ rentKey: v }), NUMERIC))}
          {row("עיר / אזור (אופציונלי)", fieldSelect(propType, draft.property.areaKey, (v) => setP({ areaKey: v }), ["text", "select"]))}
          {row("שדה הצמדה ללקוח", fieldSelect(propType, draft.property.clientLinkKey, (v) => setP({ clientLinkKey: v }), ["relation"]))}
        </div>
        {stage && (
          <div>
            <p className="text-xs text-neutral-500 mb-1">סטטוסים שלא מוצעים להתאמה ({stage.label})</p>
            <div className="flex flex-wrap gap-2">
              {stage.options.map((o) => (
                <label key={o.value} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" disabled={!isAdmin} checked={draft.property.excludedStatuses.includes(o.value)} onChange={(e) => setP({ excludedStatuses: e.target.checked ? [...draft.property.excludedStatuses, o.value] : draft.property.excludedStatuses.filter((v) => v !== o.value) })} />
                  {o.label}
                </label>
              ))}
            </div>
            {isAdmin && (
              <button onClick={addDefaultStatuses} className="mt-2 text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800">
                הוספת הסטטוסים: {MATCH_STATUS_LABELS.join(" / ")}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">שדות הלקוח</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {row("יכולת תזרים שלילי חודשי (₪)", fieldSelect(clientType, draft.client.capacityKey, (v) => setC({ capacityKey: v }), NUMERIC))}
          {row("מחיר מינימלי (אופציונלי)", fieldSelect(clientType, draft.client.minPriceKey, (v) => setC({ minPriceKey: v }), NUMERIC))}
          {row("מחיר מקסימלי (אופציונלי)", fieldSelect(clientType, draft.client.maxPriceKey, (v) => setC({ maxPriceKey: v }), NUMERIC))}
          {row("אזור מבוקש (אופציונלי)", fieldSelect(clientType, draft.client.areaKey, (v) => setC({ areaKey: v }), ["text", "select"]))}
          {row("הון עצמי (אופציונלי)", fieldSelect(clientType, draft.client.equityKey, (v) => setC({ equityKey: v }), NUMERIC))}
          {row("שדה הצמדה לנכס", fieldSelect(clientType, draft.client.propertyLinkKey, (v) => setC({ propertyLinkKey: v }), ["relation"]))}
        </div>
      </section>

      {isAdmin && (
        <div className="flex items-center gap-3">
          <button onClick={onSave} className="px-3 py-1.5 text-sm rounded-md bg-tint text-white">שמירה</button>
          {msg && <span className="text-xs text-neutral-500">{msg}</span>}
        </div>
      )}
    </div>
  );
}
