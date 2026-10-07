"use client";

import { Fragment, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { buildReport, presetRange, totals, type GroupBy, type Range, type ReportRow } from "@/lib/campaignReport";

const PRESETS = [
  { id: "7d", label: "7 ימים" },
  { id: "30d", label: "30 ימים" },
  { id: "month", label: "החודש" },
  { id: "last_month", label: "חודש שעבר" },
  { id: "90d", label: "90 ימים" },
  { id: "year", label: "השנה" },
  { id: "all", label: "הכל" },
];

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "campaign", label: "קמפיין" },
  { id: "platform", label: "פלטפורמה" },
  { id: "agency", label: "סוכנות" },
  { id: "source", label: "מקור ליד" },
];

type SortKey = "leads" | "meetings" | "won" | "revenue" | "spend" | "cpl" | "cpm" | "cpw";

export const money = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const per = (spend: number | null, n: number) => (spend && n ? money(spend / n) : "—");

function metric(r: ReportRow, key: SortKey): number {
  const div = (n: number) => (r.spend && n ? r.spend / n : Infinity);
  if (key === "cpl") return div(r.leads);
  if (key === "cpm") return div(r.meetings);
  if (key === "cpw") return div(r.won);
  if (key === "spend") return r.spend ?? -1;
  return r[key];
}

export function ReportTab() {
  const { contacts, opportunities, appointments, campaigns, campaignSpend, pipelines } = useStore();
  const [preset, setPreset] = useState("30d");
  const [custom, setCustom] = useState<Range>({ from: null, to: null });
  const [groupBy, setGroupBy] = useState<GroupBy>("campaign");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "leads", asc: false });
  const [expanded, setExpanded] = useState<string | null>(null);

  const range = preset === "custom" ? custom : presetRange(preset);

  const rows = useMemo(() => {
    const stageNames = new Map(pipelines.flatMap((p) => p.stages.map((s) => [s.id, s.name] as const)));
    return buildReport({
      contacts,
      opportunities,
      appointments,
      campaigns,
      spend: campaignSpend,
      stageName: (id) => stageNames.get(id) ?? "—",
      range,
      groupBy,
    });
    // range is derived from preset/custom each render; depend on its parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, opportunities, appointments, campaigns, campaignSpend, pipelines, range.from, range.to, groupBy]);

  const visible = rows
    .filter((r) => r.leads > 0 || (r.spend ?? 0) > 0)
    .sort((a, b) => {
      const d = metric(a, sort.key) - metric(b, sort.key);
      return sort.asc ? d : -d;
    });
  const t = totals(visible);
  const hasSpend = groupBy !== "source";

  const header = (key: SortKey, label: string) => (
    <th className="px-2 py-2 font-medium whitespace-nowrap">
      <button
        onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key.startsWith("cp") }))}
        className={`hover:underline ${sort.key === key ? "text-neutral-900 dark:text-white" : ""}`}
      >
        {label}
        {sort.key === key ? (sort.asc ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                preset === p.id
                  ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => {
              setCustom(range);
              setPreset("custom");
            }}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              preset === "custom" ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900" : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            טווח אחר
          </button>
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1 text-xs">
            <input type="date" value={custom.from ?? ""} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || null }))} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
            <span>עד</span>
            <input type="date" value={custom.to ?? ""} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || null }))} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          </div>
        )}
        <label className="text-xs flex items-center gap-1 ms-auto">
          <span className="text-neutral-500">קיבוץ לפי</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent">
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Stat label="לידים" value={t.leads.toLocaleString("he-IL")} />
        <Stat label="קבעו פגישה" value={t.meetings.toLocaleString("he-IL")} hint={pct(t.meetings, t.leads)} />
        <Stat label="עסקאות שנסגרו" value={t.won.toLocaleString("he-IL")} hint={pct(t.won, t.leads)} />
        <Stat label="הוצאה" value={hasSpend && t.spend ? money(t.spend) : "—"} />
        <Stat label="עלות לליד" value={hasSpend ? per(t.spend, t.leads) : "—"} />
        <Stat label="עלות לעסקה" value={hasSpend ? per(t.spend, t.won) : "—"} />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-400">אין לידים או הוצאות בתקופה הזו.</p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 text-start bg-neutral-50 dark:bg-neutral-900">
              <tr className="text-start">
                <th className="px-3 py-2 font-medium text-start">{GROUPS.find((g) => g.id === groupBy)?.label}</th>
                {header("leads", "לידים")}
                {header("meetings", "פגישות")}
                {header("won", "נסגרו")}
                <th className="px-2 py-2 font-medium whitespace-nowrap">פתוחים / לא נסגרו</th>
                {header("revenue", "הכנסות")}
                {hasSpend && header("spend", "הוצאה")}
                {hasSpend && header("cpl", "לליד")}
                {hasSpend && header("cpm", "לפגישה")}
                {hasSpend && header("cpw", "לעסקה")}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <Fragment key={r.key}>
                  <tr
                    onClick={() => setExpanded((k) => (k === r.key ? null : r.key))}
                    className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer"
                  >
                    <td className="px-3 py-2 max-w-72">
                      <div className="truncate" title={r.label}>
                        {r.label}
                      </div>
                      {r.sublabel && <div className="text-xs text-neutral-400 truncate">{r.sublabel}</div>}
                    </td>
                    <Num>{r.leads}</Num>
                    <Num hint={pct(r.meetings, r.leads)}>{r.meetings}</Num>
                    <Num hint={pct(r.won, r.leads)}>{r.won}</Num>
                    <Num>
                      {r.open} / {r.lost}
                    </Num>
                    <Num>{r.revenue ? money(r.revenue) : "—"}</Num>
                    {hasSpend && <Num>{r.spend ? money(r.spend) : "—"}</Num>}
                    {hasSpend && <Num>{per(r.spend, r.leads)}</Num>}
                    {hasSpend && <Num>{per(r.spend, r.meetings)}</Num>}
                    {hasSpend && <Num>{per(r.spend, r.won)}</Num>}
                  </tr>
                  {expanded === r.key && (
                    <tr className="bg-neutral-50 dark:bg-neutral-900">
                      <td colSpan={hasSpend ? 10 : 6} className="px-3 py-3">
                        <div className="grid md:grid-cols-2 gap-4 text-xs">
                          <Breakdown title="פתוחים לפי שלב" items={r.openStages} />
                          <Breakdown title="לא נסגרו — סיבות" items={r.lostReasons} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="border-t-2 border-neutral-200 dark:border-neutral-700 font-semibold">
                <td className="px-3 py-2">סה״כ</td>
                <Num>{t.leads}</Num>
                <Num hint={pct(t.meetings, t.leads)}>{t.meetings}</Num>
                <Num hint={pct(t.won, t.leads)}>{t.won}</Num>
                <Num>
                  {t.open} / {t.lost}
                </Num>
                <Num>{t.revenue ? money(t.revenue) : "—"}</Num>
                {hasSpend && <Num>{t.spend ? money(t.spend) : "—"}</Num>}
                {hasSpend && <Num>{per(t.spend, t.leads)}</Num>}
                {hasSpend && <Num>{per(t.spend, t.meetings)}</Num>}
                {hasSpend && <Num>{per(t.spend, t.won)}</Num>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-neutral-400 mt-3 leading-relaxed">
        פגישות ועסקאות נספרות מתוך הלידים שנכנסו בתקופה, גם אם קרו אחריה. הוצאה חודשית מתחלקת שווה בין ימי החודש. לחיצה על שורה
        מציגה את הפירוט.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">
        {label}
        {hint && hint !== "—" && <span className="text-neutral-400"> · {hint}</span>}
      </div>
    </div>
  );
}

function Num({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <td className="px-2 py-2 text-center whitespace-nowrap tabular-nums">
      {children}
      {hint && hint !== "—" && <div className="text-[10px] text-neutral-400">{hint}</div>}
    </td>
  );
}

function Breakdown({ title, items }: { title: string; items: [string, number][] }) {
  const max = Math.max(1, ...items.map(([, n]) => n));
  return (
    <div>
      <p className="font-semibold text-neutral-500 mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-neutral-400">אין</p>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 8).map(([label, n]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-40 truncate" title={label}>
                {label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                <div className="h-full bg-neutral-700 dark:bg-neutral-300" style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <span className="w-8 text-end tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
