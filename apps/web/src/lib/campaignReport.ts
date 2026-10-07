import type { Appointment, Campaign, CampaignSpend, Contact, Opportunity } from "./types";
import { platformLabel } from "./attribution";

// Campaign performance, cohort-style: a group's leads are the leads that
// ARRIVED in the period, and its meetings/deals are what those same leads
// went on to do (whenever that happened). Spend is the money spent in the
// period, so cost-per-lead/meeting/deal compare like with like.

export type GroupBy = "campaign" | "platform" | "agency" | "source";
export type Range = { from: string | null; to: string | null }; // yyyy-mm-dd, inclusive; null = open

export type ReportRow = {
  key: string;
  label: string;
  sublabel?: string;
  leads: number;
  meetings: number;
  won: number;
  lost: number;
  open: number;
  revenue: number;
  spend: number | null; // null = spend can't be attributed to this grouping
  lostReasons: [string, number][];
  openStages: [string, number][];
};

// Spend entered per month (by hand or a monthly CSV) is spread evenly over
// the month's days, so a range covering half a month gets half of it.
export const MONTHLY_SOURCES = new Set(["manual", "csv_month"]);

const NONE = "__none__";
const day = (iso: string) => iso.slice(0, 10);
const inRange = (d: string, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to);

function daysInMonth(d: string) {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function spendInRange(s: CampaignSpend, r: Range): number {
  if (!MONTHLY_SOURCES.has(s.source)) return inRange(s.day, r) ? s.amount : 0;
  const month = s.day.slice(0, 7);
  const total = daysInMonth(s.day);
  let covered = 0;
  for (let i = 1; i <= total; i++) if (inRange(`${month}-${String(i).padStart(2, "0")}`, r)) covered++;
  return (s.amount * covered) / total;
}

export function buildReport(input: {
  contacts: Contact[];
  opportunities: Opportunity[];
  appointments: Appointment[];
  campaigns: Campaign[];
  spend: CampaignSpend[];
  stageName: (stageId: string) => string;
  range: Range;
  groupBy: GroupBy;
}): ReportRow[] {
  const { contacts, opportunities, appointments, campaigns, spend, range, groupBy } = input;
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const keyOfCampaign = (c: Campaign | undefined): string => {
    if (groupBy === "campaign") return c?.id ?? NONE;
    if (groupBy === "platform") return c?.platform ?? NONE;
    if (groupBy === "agency") return c ? c.agency || "in-house" : NONE;
    return NONE;
  };
  const keyOfContact = (ct: Contact) =>
    groupBy === "source" ? ct.source || NONE : keyOfCampaign(ct.campaignId ? campaignById.get(ct.campaignId) : undefined);

  const labelOf = (key: string): { label: string; sublabel?: string } => {
    if (key === NONE) return { label: groupBy === "source" ? "ללא מקור" : "ללא קמפיין" };
    if (groupBy === "campaign") {
      const c = campaignById.get(key);
      return { label: c?.name ?? "—", sublabel: [platformLabel(c?.platform), c?.agency].filter(Boolean).join(" · ") };
    }
    if (groupBy === "platform") return { label: platformLabel(key) };
    if (groupBy === "agency") return { label: key === "in-house" ? "ניהול עצמי (ללא סוכנות)" : key };
    return { label: key };
  };

  const meetingsBy = new Set(appointments.map((a) => a.contactId).filter(Boolean) as string[]);
  const oppsBy = new Map<string, Opportunity[]>();
  for (const o of opportunities) oppsBy.set(o.contactId, [...(oppsBy.get(o.contactId) ?? []), o]);

  const rows = new Map<string, ReportRow & { reasons: Map<string, number>; stages: Map<string, number> }>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) {
      r = {
        key,
        ...labelOf(key),
        leads: 0,
        meetings: 0,
        won: 0,
        lost: 0,
        open: 0,
        revenue: 0,
        spend: groupBy === "source" ? null : 0,
        lostReasons: [],
        openStages: [],
        reasons: new Map(),
        stages: new Map(),
      };
      rows.set(key, r);
    }
    return r;
  };

  for (const ct of contacts) {
    if (!inRange(day(ct.createdAt), range)) continue;
    const r = row(keyOfContact(ct));
    r.leads++;
    if (meetingsBy.has(ct.id)) r.meetings++;
    const opps = oppsBy.get(ct.id) ?? [];
    const won = opps.filter((o) => o.status === "won");
    const open = opps.filter((o) => o.status === "open");
    if (won.length) {
      r.won++;
      r.revenue += won.reduce((sum, o) => sum + o.value, 0);
    } else if (open.length) {
      r.open++;
      for (const o of open) r.stages.set(o.stageId, (r.stages.get(o.stageId) ?? 0) + 1);
    } else if (opps.length) {
      r.lost++;
      const reason = opps.find((o) => o.lostReason)?.lostReason ?? (opps.some((o) => o.status === "abandoned") ? "בוטל" : "ללא סיבה");
      r.reasons.set(reason, (r.reasons.get(reason) ?? 0) + 1);
    }
  }

  if (groupBy !== "source") {
    for (const s of spend) {
      const amount = spendInRange(s, range);
      if (!amount) continue;
      const r = row(keyOfCampaign(campaignById.get(s.campaignId)));
      r.spend = (r.spend ?? 0) + amount;
    }
  }

  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return [...rows.values()].map(({ reasons, stages, ...r }) => ({
    ...r,
    lostReasons: sorted(reasons),
    openStages: sorted(stages).map(([id, n]) => [input.stageName(id), n] as [string, number]),
  }));
}

export function totals(rows: ReportRow[]): ReportRow {
  const anySpend = rows.some((r) => r.spend !== null);
  return rows.reduce<ReportRow>(
    (t, r) => ({
      ...t,
      leads: t.leads + r.leads,
      meetings: t.meetings + r.meetings,
      won: t.won + r.won,
      lost: t.lost + r.lost,
      open: t.open + r.open,
      revenue: t.revenue + r.revenue,
      spend: anySpend ? (t.spend ?? 0) + (r.spend ?? 0) : null,
    }),
    { key: "total", label: "סה״כ", leads: 0, meetings: 0, won: 0, lost: 0, open: 0, revenue: 0, spend: anySpend ? 0 : null, lostReasons: [], openStages: [] }
  );
}

// Preset periods, in the browser's local calendar.
export function presetRange(preset: string, now = new Date()): Range {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysAgo = (n: number) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  switch (preset) {
    case "7d":
      return { from: daysAgo(6), to: iso(now) };
    case "30d":
      return { from: daysAgo(29), to: iso(now) };
    case "90d":
      return { from: daysAgo(89), to: iso(now) };
    case "month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case "last_month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "year":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    default:
      return { from: null, to: null };
  }
}
