"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { useStore } from "@/lib/store";
import { PLATFORMS, platformLabel } from "@/lib/attribution";
import { money } from "./ReportTab";

const input = "px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SpendTab({ isAdmin }: { isAdmin: boolean }) {
  const { campaigns, campaignSpend, setSpend } = useStore();
  const [month, setMonth] = useState(thisMonth());
  const day = `${month}-01`;

  const otherSources = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of campaignSpend) {
      if (s.source === "manual" || !s.day.startsWith(month)) continue;
      m.set(s.campaignId, (m.get(s.campaignId) ?? 0) + s.amount);
    }
    return m;
  }, [campaignSpend, month]);

  const manual = new Map(campaignSpend.filter((s) => s.source === "manual" && s.day === day).map((s) => [s.campaignId, s.amount]));
  const active = campaigns
    .filter((c) => !c.archived || manual.has(c.id) || otherSources.has(c.id))
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name));
  const monthTotal = [...manual.values(), ...otherSources.values()].reduce((a, b) => a + b, 0);

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
        כמה הוצאתם על כל קמפיין. אפשר להזין סכום חודשי ידנית (גם על הוצאה לסוכנות), או לייבא קובץ דוח מ-Meta, Google, TikTok או
        מהסוכנות. מהנתונים האלה מחושבות העלות לליד, לפגישה ולעסקה.
      </p>
      {!isAdmin && <p className="text-xs text-amber-600 mb-3">רק מנהלים יכולים לעדכן הוצאות.</p>}

      {isAdmin && <SpendImport />}

      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs flex items-center gap-1">
          <span className="text-neutral-500">חודש</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={input} />
        </label>
        <span className="text-sm text-neutral-500 ms-auto">סה״כ בחודש: {money(monthTotal)}</span>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-neutral-400">אין קמפיינים עדיין.</p>
      ) : (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800">
          {active.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="truncate" title={c.name}>
                  {c.name}
                </div>
                <div className="text-xs text-neutral-400">{[platformLabel(c.platform), c.agency].filter(Boolean).join(" · ")}</div>
              </div>
              {otherSources.has(c.id) && <span className="text-xs text-neutral-400">מקובץ: {money(otherSources.get(c.id)!)}</span>}
              <SpendInput
                key={`${c.id}-${day}`}
                initial={manual.get(c.id)}
                disabled={!isAdmin}
                onSave={(amount) => setSpend(c.id, day, amount)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpendInput({ initial, disabled, onSave }: { initial?: number; disabled: boolean; onSave: (amount: number | null) => Promise<void> }) {
  const [value, setValue] = useState(initial !== undefined ? String(initial) : "");
  const [saved, setSaved] = useState(false);

  async function commit() {
    const trimmed = value.replace(/[,₪\s]/g, "");
    const amount = trimmed === "" ? null : Number(trimmed);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) return;
    if (amount === (initial ?? null)) return;
    await onSave(amount);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <span className="flex items-center gap-1">
      <span className="text-neutral-400">₪</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        disabled={disabled}
        inputMode="decimal"
        placeholder="0"
        className={`${input} w-28 text-end`}
      />
      <span className={`text-xs text-emerald-600 w-3 ${saved ? "" : "invisible"}`}>✓</span>
    </span>
  );
}

/* --------------------------------- CSV import --------------------------------- */

type Parsed = { name: string; day: string; monthly: boolean; amount: number; platform?: string };

const NAME_COL = /campaign|קמפיין/i;
const DATE_COL = /^(day|date|reporting starts|month|תאריך|יום|חודש)/i;
const AMOUNT_COL = /amount spent|spend|cost|עלות|הוצאה|סכום|הוצאות/i;
const PLATFORM_COL = /platform|פלטפורמה|network/i;

// yyyy-mm-dd, dd/mm/yyyy, dd.mm.yyyy → day; yyyy-mm, mm/yyyy → month.
function parseDate(v: string): { day: string; monthly: boolean } | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { day: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, monthly: false };
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return { day: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, monthly: false };
  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return { day: `${m[1]}-${m[2].padStart(2, "0")}-01`, monthly: true };
  m = s.match(/^(\d{1,2})[/.](\d{4})$/);
  if (m) return { day: `${m[2]}-${m[1].padStart(2, "0")}-01`, monthly: true };
  return null;
}

function SpendImport() {
  const { campaigns, addCampaign, importSpend } = useStore();
  const [rows, setRows] = useState<Parsed[] | null>(null);
  const [error, setError] = useState("");
  const [fallbackMonth, setFallbackMonth] = useState(thisMonth());
  const [noDate, setNoDate] = useState(false);
  const [platform, setPlatform] = useState("meta");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  function handleFile(file: File) {
    setError("");
    setResult("");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const cols = meta.fields ?? [];
        const nameCol = cols.find((c) => NAME_COL.test(c));
        const amountCol = cols.find((c) => AMOUNT_COL.test(c));
        const dateCol = cols.find((c) => DATE_COL.test(c));
        const platformCol = cols.find((c) => PLATFORM_COL.test(c));
        if (!nameCol || !amountCol) {
          setError(`לא זוהו עמודות של שם קמפיין והוצאה. עמודות בקובץ: ${cols.join(", ")}`);
          setRows(null);
          return;
        }
        setNoDate(!dateCol);
        const parsed: Parsed[] = [];
        for (const r of data) {
          const name = (r[nameCol] ?? "").trim();
          const amount = Number(String(r[amountCol] ?? "").replace(/[^\d.-]/g, ""));
          if (!name || !amount || Number.isNaN(amount) || /^(total|סה"?כ)/i.test(name)) continue;
          const d = dateCol ? parseDate(r[dateCol] ?? "") : null;
          if (dateCol && !d) continue;
          parsed.push({ name, amount, day: d?.day ?? "", monthly: d?.monthly ?? true, platform: platformCol ? r[platformCol]?.trim().toLowerCase() : undefined });
        }
        setRows(parsed);
      },
      error: (err) => setError(err.message),
    });
  }

  async function handleImport() {
    if (!rows) return;
    setBusy(true);
    try {
      const byKey = new Map(campaigns.map((c) => [`${c.platform}|${c.name.toLowerCase()}`, c.id]));
      const byName = new Map(campaigns.map((c) => [c.name.toLowerCase(), c.id]));
      let created = 0;
      // Sum duplicates (e.g. one row per ad set) into one figure per campaign+day.
      const sums = new Map<string, { campaignId: string; day: string; amount: number; monthly: boolean }>();
      for (const r of rows) {
        const p = r.platform && PLATFORMS.some((x) => x.id === r.platform) ? r.platform : platform;
        let id = byKey.get(`${p}|${r.name.toLowerCase()}`) ?? byName.get(r.name.toLowerCase());
        if (!id) {
          id = (await addCampaign({ name: r.name, platform: p })).id;
          byKey.set(`${p}|${r.name.toLowerCase()}`, id);
          byName.set(r.name.toLowerCase(), id);
          created++;
        }
        const day = r.day || `${fallbackMonth}-01`;
        const key = `${id}|${day}|${r.monthly}`;
        const prev = sums.get(key);
        sums.set(key, { campaignId: id, day, amount: (prev?.amount ?? 0) + r.amount, monthly: r.monthly });
      }
      const all = [...sums.values()];
      const daily = await importSpend(all.filter((x) => !x.monthly), "csv");
      const monthly = await importSpend(all.filter((x) => x.monthly), "csv_month");
      setResult(`יובאו ${daily + monthly} שורות הוצאה${created ? `, נוצרו ${created} קמפיינים חדשים` : ""}. ייבוא חוזר של אותו קובץ מעדכן ולא מכפיל.`);
      setRows(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הייבוא נכשל");
    } finally {
      setBusy(false);
    }
  }

  const total = rows?.reduce((a, r) => a + r.amount, 0) ?? 0;

  return (
    <details className="mb-6 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
      <summary className="text-sm font-medium cursor-pointer">ייבוא הוצאות מקובץ (CSV)</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-xs text-neutral-500 leading-relaxed">
          ייצוא דוח מ-Meta Ads Manager / Google Ads / TikTok, או קובץ מהסוכנות, עם עמודות: שם קמפיין, הוצאה, ורצוי גם תאריך (יום או
          חודש). קמפיין שעוד לא קיים במערכת ייווצר.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="text-xs" />
          <label className="text-xs flex items-center gap-1">
            <span className="text-neutral-500">פלטפורמה לקמפיינים חדשים</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {result && <p className="text-xs text-emerald-600">{result}</p>}
        {rows && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs">
              נמצאו {rows.length} שורות, סה״כ {money(total)}.
            </span>
            {noDate && (
              <label className="text-xs flex items-center gap-1">
                <span className="text-neutral-500">אין עמודת תאריך — לשייך לחודש</span>
                <input type="month" value={fallbackMonth} onChange={(e) => e.target.value && setFallbackMonth(e.target.value)} className={input} />
              </label>
            )}
            <button onClick={handleImport} disabled={busy || !rows.length} className="px-3 py-1 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-40">
              {busy ? "מייבא…" : "ייבוא"}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
