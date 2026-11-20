"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useMatchingConfig } from "@/lib/useMatchingConfig";
import { recordTitles, updateRecord, useRecords } from "@/lib/useRecords";
import { isExcluded, suggestClients, suggestProperties, type MatchResult } from "@/lib/matching";
import type { CrmRecord, ObjectType } from "@/lib/types";

const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;
const card = "rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm";

// Shows on a property's or client's record page when that object type plays
// the "property" / "client" role in the org's matching config: the current
// attachment plus suggestions from the formula.
export function MatchPanel({ type, record, onChanged }: { type: ObjectType; record: CrmRecord; onChanged: (r: CrmRecord) => void }) {
  const { objectTypes } = useStore();
  const { config, ready } = useMatchingConfig();
  const role = type.id === config.propertyTypeId ? "property" : type.id === config.clientTypeId ? "client" : null;
  const propType = objectTypes.find((t) => t.id === config.propertyTypeId);
  const clientType = objectTypes.find((t) => t.id === config.clientTypeId);
  const otherType = role === "property" ? clientType : propType;
  const { records: others } = useRecords(role ? otherType : undefined);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const myLinkKey = role === "property" ? config.property.clientLinkKey : config.client.propertyLinkKey;
  const otherLinkKey = role === "property" ? config.client.propertyLinkKey : config.property.clientLinkKey;
  const attachedId = myLinkKey ? String(record.data[myLinkKey] ?? "") : "";
  const configured = Boolean(config.property.priceKey && config.property.rentKey && config.client.capacityKey);

  useEffect(() => {
    if (attachedId) recordTitles([attachedId]).then(setTitles);
  }, [attachedId]);

  const suggestions = useMemo(() => {
    if (!role || !others || !configured) return null;
    return role === "property" ? suggestClients(config, propType, record, others) : suggestProperties(config, propType, record, others);
  }, [role, others, configured, config, propType, record]);

  if (!ready || !role || !otherType) return null;
  const excluded = role === "property" && isExcluded(config, propType, record);

  async function link(other: CrmRecord | null) {
    if (!myLinkKey) return setError("לא הוגדר שדה קישור בהגדרות ההתאמה");
    setBusy(other?.id ?? "detach");
    setError("");
    try {
      const prevId = attachedId;
      const updated = await updateRecord(type, record, { [myLinkKey]: other ? other.id : null });
      // Mirror the link on the other side so both cards show it.
      if (otherLinkKey) {
        if (other) await updateRecord(otherType!, other, { [otherLinkKey]: record.id });
        else if (prevId) {
          const prev = (others ?? []).find((o) => o.id === prevId);
          if (prev && prev.data[otherLinkKey] === record.id) await updateRecord(otherType!, prev, { [otherLinkKey]: null });
        }
      }
      onChanged(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "הפעולה נכשלה");
    } finally {
      setBusy("");
    }
  }

  const attached = attachedId ? (others ?? []).find((o) => o.id === attachedId) : undefined;
  const attachedTitle = attached?.title ?? titles[attachedId];

  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-500 mb-2">{role === "property" ? "התאמת לקוחות" : "נכסים מתאימים"}</h2>
      <div className={`${card} p-4 space-y-3`}>
        {attachedId && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500">{role === "property" ? "מוצמד ללקוח:" : "נכס מוצמד:"}</span>
            <Link href={`/o/${otherType.id}/${attachedId}`} className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
              {attachedTitle || "פתיחה"}
            </Link>
            <button onClick={() => link(null)} disabled={busy === "detach"} className="ms-auto text-xs text-neutral-400 hover:text-red-500">
              ביטול הצמדה
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        {!configured ? (
          <p className="text-xs text-neutral-400">ההתאמה עוד לא הוגדרה (מחיר, שכירות ויכולת תזרים). אפשר להגדיר ב־הגדרות ← התאמת לקוחות לנכסים.</p>
        ) : excluded ? (
          <p className="text-xs text-neutral-500">הנכס בסטטוס שלא מוצע להתאמה (בתהליך רכישה / נמכר).</p>
        ) : !suggestions || !others ? (
          <p className="text-xs text-neutral-400">טוען…</p>
        ) : suggestions.results.length === 0 ? (
          <p className="text-xs text-neutral-400">אין התאמות כרגע.{suggestions.skipped ? ` ${suggestions.skipped} ${role === "property" ? "לקוחות" : "נכסים"} לא נבדקו כי חסר בהם נתון (מחיר / שכירות / יכולת תזרים).` : ""}</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {suggestions.results.slice(0, 15).map((m) => (
              <Row key={(role === "property" ? m.client : m.property).id} m={m} role={role} otherTypeId={otherType.id} attachedId={attachedId} busy={busy} onAttach={() => link(role === "property" ? m.client : m.property)} />
            ))}
          </ul>
        )}
        {suggestions && suggestions.results.length > 0 && suggestions.skipped > 0 && <p className="text-[11px] text-neutral-400">{suggestions.skipped} רשומות לא נבדקו כי חסרים בהן נתונים.</p>}
        {suggestions && "excludedCount" in suggestions && suggestions.excludedCount > 0 && <p className="text-[11px] text-neutral-400">{suggestions.excludedCount} נכסים בתהליך רכישה / נמכרו ולא מוצעים.</p>}
      </div>
    </section>
  );
}

function Row({ m, role, otherTypeId, attachedId, busy, onAttach }: { m: MatchResult; role: "property" | "client"; otherTypeId: string; attachedId: string; busy: string; onAttach: () => void }) {
  const other = role === "property" ? m.client : m.property;
  return (
    <li className="py-2 text-sm">
      <div className="flex items-center gap-2">
        <Link href={`/o/${otherTypeId}/${other.id}`} className="font-medium hover:underline truncate">
          {other.title || "ללא שם"}
        </Link>
        {attachedId === other.id ? (
          <span className="ms-auto text-xs text-emerald-600">מוצמד</span>
        ) : (
          <button onClick={onAttach} disabled={busy === other.id} className="ms-auto px-2 py-0.5 text-xs rounded-md bg-tint text-white disabled:opacity-40">
            הצמד
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500 mt-0.5">
        תשלום חודשי {ils(m.payment)} · שכירות {ils(m.rent)} · {m.cashFlow >= 0 ? `תזרים חיובי ${ils(m.cashFlow)}` : `תזרים שלילי ${ils(-m.cashFlow)}`} · יכולת {ils(m.capacity)}
        {m.burden > m.capacity && <span className="text-amber-600"> (חריגה עד {Math.round((m.burden / m.capacity - 1) * 100)}%)</span>}
      </p>
      {m.checks.length > 0 && (
        <p className="flex flex-wrap gap-1 mt-1">
          {m.checks.map((c) => (
            <span key={c.label} title={c.detail} className={`text-[11px] px-1.5 rounded-full ${c.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
              {c.ok ? "✓" : "!"} {c.label}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}
