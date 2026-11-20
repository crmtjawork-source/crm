import type { CrmRecord, ObjectType } from "./types";

// Client ↔ property matching. Everything is configured per organisation: which
// object types play the "property" and "client" roles, which fields hold the
// numbers, and the financing formula.

export type MatchingConfig = {
  propertyTypeId?: string;
  clientTypeId?: string;
  formula: {
    ltv: number; // share of the asking price that is financed (0.75)
    unitSize: number; // the loan is split into units of this size (100,000 ₪)
    perUnit: number; // monthly payment per unit (525 ₪)
    tolerance: number; // how far above the client's capacity still counts (0.10)
  };
  property: {
    priceKey?: string; // asking price
    rentKey?: string; // expected monthly rent
    areaKey?: string; // city / area (soft criterion)
    clientLinkKey?: string; // relation field → client (filled on attach)
    excludedStatuses: string[]; // stage option values never offered for matching
  };
  client: {
    capacityKey?: string; // the monthly negative cash flow the client can carry
    minPriceKey?: string;
    maxPriceKey?: string;
    areaKey?: string;
    equityKey?: string;
    propertyLinkKey?: string; // relation field → property (filled on attach)
  };
};

export const DEFAULT_MATCHING: MatchingConfig = {
  formula: { ltv: 0.75, unitSize: 100000, perUnit: 525, tolerance: 0.1 },
  property: { excludedStatuses: [] },
  client: {},
};

export function normalizeConfig(raw: unknown): MatchingConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<MatchingConfig>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    propertyTypeId: c.propertyTypeId,
    clientTypeId: c.clientTypeId,
    formula: {
      ltv: num(c.formula?.ltv, 0.75),
      unitSize: Math.max(1, num(c.formula?.unitSize, 100000)),
      perUnit: num(c.formula?.perUnit, 525),
      tolerance: num(c.formula?.tolerance, 0.1),
    },
    property: { ...c.property, excludedStatuses: Array.isArray(c.property?.excludedStatuses) ? c.property!.excludedStatuses : [] },
    client: { ...c.client },
  };
}

// Statuses a property can take, with the three the business asked for.
export const MATCH_STATUS_LABELS = ["ממתין להצמדה", "בתהליך רכישה", "נמכר"];

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Monthly financing cost of a property: price × LTV, split into units, each unit costing `perUnit`.
export function monthlyPayment(price: number, f: MatchingConfig["formula"]): number {
  return (price * f.ltv * (f.perUnit)) / f.unitSize;
}

export type MatchCheck = { label: string; ok: boolean | null; detail?: string };
export type MatchResult = {
  property: CrmRecord;
  client: CrmRecord;
  payment: number;
  rent: number;
  cashFlow: number; // rent − payment (negative = the client pays each month)
  burden: number; // max(0, −cashFlow)
  capacity: number;
  limit: number; // capacity × (1 + tolerance)
  eligible: boolean;
  checks: MatchCheck[];
  score: number; // higher = better
};

export type MatchBlock = { reason: "excluded_status" | "missing_property_data" | "missing_client_data" };

// Evaluates one property against one client. `null` with a reason when it cannot be evaluated.
export function evaluate(cfg: MatchingConfig, property: CrmRecord, client: CrmRecord): MatchResult | MatchBlock {
  const p = cfg.property, c = cfg.client;
  const price = toNum(p.priceKey && property.data[p.priceKey]);
  const rent = toNum(p.rentKey && property.data[p.rentKey]);
  const capacity = toNum(c.capacityKey && client.data[c.capacityKey]);
  if (price === null || rent === null) return { reason: "missing_property_data" };
  if (capacity === null) return { reason: "missing_client_data" };
  const payment = monthlyPayment(price, cfg.formula);
  const cashFlow = rent - payment;
  const burden = Math.max(0, -cashFlow);
  const limit = capacity * (1 + cfg.formula.tolerance);
  const eligible = burden <= limit;

  const checks: MatchCheck[] = [];
  const minP = toNum(c.minPriceKey && client.data[c.minPriceKey]);
  const maxP = toNum(c.maxPriceKey && client.data[c.maxPriceKey]);
  if (minP !== null || maxP !== null) checks.push({ label: "טווח מחיר", ok: (minP === null || price >= minP) && (maxP === null || price <= maxP) });
  const pa = String((p.areaKey && property.data[p.areaKey]) ?? "").trim().toLowerCase();
  const ca = String((c.areaKey && client.data[c.areaKey]) ?? "").trim().toLowerCase();
  if (pa && ca) checks.push({ label: "אזור", ok: ca.includes(pa) || pa.includes(ca) });
  const equity = toNum(c.equityKey && client.data[c.equityKey]);
  if (equity !== null) checks.push({ label: "הון עצמי", ok: equity >= price * (1 - cfg.formula.ltv), detail: `נדרש ${Math.round(price * (1 - cfg.formula.ltv)).toLocaleString("he-IL")} ₪` });

  const soft = checks.filter((x) => x.ok).length - checks.filter((x) => x.ok === false).length;
  const headroom = limit > 0 ? 1 - burden / limit : burden === 0 ? 1 : 0;
  return { property, client, payment, rent, cashFlow, burden, capacity, limit, eligible, checks, score: soft * 10 + headroom };
}

export const isBlock = (r: MatchResult | MatchBlock): r is MatchBlock => "reason" in r;

export function isExcluded(cfg: MatchingConfig, type: ObjectType | undefined, property: CrmRecord): boolean {
  const key = type?.stageField;
  return !!key && cfg.property.excludedStatuses.includes(String(property.data[key] ?? ""));
}

// Clients that fit a property, best first. Excluded properties offer nothing.
export function suggestClients(cfg: MatchingConfig, propType: ObjectType | undefined, property: CrmRecord, clients: CrmRecord[]) {
  if (isExcluded(cfg, propType, property)) return { excluded: true, results: [] as MatchResult[], skipped: 0 };
  const evals = clients.map((cl) => evaluate(cfg, property, cl));
  return { excluded: false, results: evals.filter((e): e is MatchResult => !isBlock(e) && e.eligible).sort((a, b) => b.score - a.score), skipped: evals.filter(isBlock).length };
}

// Properties that fit a client, best first; sold / in-purchase ones are skipped.
export function suggestProperties(cfg: MatchingConfig, propType: ObjectType | undefined, client: CrmRecord, properties: CrmRecord[]) {
  const open = properties.filter((p) => !isExcluded(cfg, propType, p));
  const evals = open.map((p) => evaluate(cfg, p, client));
  return { results: evals.filter((e): e is MatchResult => !isBlock(e) && e.eligible).sort((a, b) => b.score - a.score), skipped: evals.filter(isBlock).length, excludedCount: properties.length - open.length };
}
