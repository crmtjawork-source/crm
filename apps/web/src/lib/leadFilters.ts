import type { Campaign, Contact, CrmRecord, LeadStatus, Member, ObjectField, ObjectType, Opportunity, Pipeline, Task } from "./types";

// Advanced filter: a list of conditions on any field of a record (built-in or
// custom), joined by "all" (AND) or "any" (OR). Works for leads, deals,
// custom-object records and tasks — each supplies its own list of fields.

export type FieldKind = "enum" | "date" | "number" | "text" | "bool";

export type FilterOp =
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "eq"
  | "gt"
  | "lt"
  | "between"
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "is_true"
  | "is_false"
  | "empty"
  | "not_empty";

export type FilterCond = { id: string; field: string; op: FilterOp; values: string[] }; // between: [from, to]
export type LeadFilter = { match: "all" | "any"; conds: FilterCond[] };

type Value = string | string[] | undefined;

export type FilterField<T = Contact> = {
  key: string;
  label: string;
  group: string;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  get: (record: T) => Value;
};

// A field of any record type, for code that only reads its description.
export type AnyFilterField = FilterField<never>;

export const OPS: Record<FieldKind, { op: FilterOp; label: string }[]> = {
  enum: [
    { op: "in", label: "אחד מ" },
    { op: "not_in", label: "לא אחד מ" },
    { op: "empty", label: "ריק" },
    { op: "not_empty", label: "לא ריק" },
  ],
  date: [
    { op: "between", label: "בין תאריכים" },
    { op: "today", label: "היום" },
    { op: "yesterday", label: "אתמול" },
    { op: "last_7", label: "7 הימים האחרונים" },
    { op: "last_30", label: "30 הימים האחרונים" },
    { op: "this_month", label: "החודש" },
    { op: "last_month", label: "החודש הקודם" },
    { op: "empty", label: "ריק" },
    { op: "not_empty", label: "לא ריק" },
  ],
  number: [
    { op: "eq", label: "שווה ל" },
    { op: "gt", label: "גדול מ" },
    { op: "lt", label: "קטן מ" },
    { op: "between", label: "בין" },
    { op: "empty", label: "ריק" },
    { op: "not_empty", label: "לא ריק" },
  ],
  text: [
    { op: "contains", label: "מכיל" },
    { op: "not_contains", label: "לא מכיל" },
    { op: "eq", label: "שווה ל" },
    { op: "empty", label: "ריק" },
    { op: "not_empty", label: "לא ריק" },
  ],
  bool: [
    { op: "is_true", label: "מסומן" },
    { op: "is_false", label: "לא מסומן" },
  ],
};

const OUTCOMES = [
  { value: "won", label: "נסגרה עסקה" },
  { value: "lost", label: "לא נסגרה עסקה" },
  { value: "abandoned", label: "בוטלה עסקה" },
];

const distinct = (values: (string | undefined)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));

export function buildFilterFields({
  contacts,
  leadFields,
  leadStatuses,
  pipelines,
  campaigns,
  members,
  dealOf,
}: {
  contacts: Contact[];
  leadFields: ObjectField[];
  leadStatuses: LeadStatus[];
  pipelines: Pipeline[];
  campaigns: Campaign[];
  members: Member[];
  dealOf: Map<string, Opportunity>;
}): FilterField[] {
  const base = "פרטי ליד";
  const fields: FilterField[] = [
    { key: "createdAt", label: "תאריך כניסה", group: base, kind: "date", get: (c) => c.createdAt },
    { key: "lastActivityAt", label: "פעילות אחרונה", group: base, kind: "date", get: (c) => c.lastActivityAt },
    {
      key: "handlingStatus",
      label: "סטטוס ליד",
      group: base,
      kind: "enum",
      options: leadStatuses.map((st) => ({ value: st.name, label: st.name })),
      get: (c) => c.handlingStatus,
    },
    {
      key: "stage",
      label: "שלב",
      group: base,
      kind: "enum",
      options: [
        ...pipelines.flatMap((p) => p.stages.map((st) => ({ value: st.id, label: `${pipelines.length > 1 ? `${p.name} · ` : ""}${st.name}` }))),
        ...OUTCOMES,
      ],
      get: (c) => {
        const d = dealOf.get(c.id);
        return d ? (d.status === "open" ? d.stageId : d.status) : undefined;
      },
    },
    {
      key: "campaign",
      label: "קמפיין",
      group: base,
      kind: "enum",
      options: [...campaigns].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.archived ? `${c.name} (בארכיון)` : c.name })),
      get: (c) => c.campaignId,
    },
    {
      key: "owner",
      label: "בעלים",
      group: base,
      kind: "enum",
      options: members.map((m) => ({ value: m.email.toLowerCase(), label: m.name })),
      get: (c) => c.ownerEmail?.toLowerCase(),
    },
    { key: "tags", label: "תגיות", group: base, kind: "enum", options: distinct(contacts.flatMap((c) => c.tags)), get: (c) => c.tags },
    { key: "source", label: "מקור", group: base, kind: "enum", options: distinct(contacts.map((c) => c.source)), get: (c) => c.source },
    { key: "noAnswerCount", label: "ניסיונות ללא מענה", group: base, kind: "number", get: (c) => (c.noAnswerCount ? String(c.noAnswerCount) : undefined) },
    { key: "name", label: "שם", group: base, kind: "text", get: (c) => c.name },
    { key: "phone", label: "טלפון", group: base, kind: "text", get: (c) => c.phone },
    { key: "email", label: "אימייל", group: base, kind: "text", get: (c) => c.email },
  ];

  for (const f of [...leadFields].sort((a, b) => a.position - b.position)) {
    const raw = (c: Contact) => c.fields[f.key];
    const group = f.section || "שדות נוספים";
    const key = `field:${f.key}`;
    if (f.type === "select" || f.type === "multi_select") {
      const options = f.options.length ? f.options.map((o) => ({ value: o.value, label: o.label })) : distinct(contacts.map(raw));
      fields.push({
        key,
        label: f.label,
        group,
        kind: "enum",
        options,
        get: f.type === "multi_select" ? (c) => (raw(c) ?? "").split(/\s*,\s*/).filter(Boolean) : raw,
      });
    } else if (f.type === "number" || f.type === "currency") fields.push({ key, label: f.label, group, kind: "number", get: raw });
    else if (f.type === "date" || f.type === "datetime") fields.push({ key, label: f.label, group, kind: "date", get: raw });
    else if (f.type === "checkbox") fields.push({ key, label: f.label, group, kind: "bool", get: raw });
    else if (f.type !== "relation") fields.push({ key, label: f.label, group, kind: "text", get: raw });
  }
  return fields;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// [start, end) for a date operator, in local time.
function dateRange(op: FilterOp, values: string[], now = new Date()): [Date | null, Date | null] | null {
  const today = dayStart(now);
  switch (op) {
    case "today":
      return [today, addDays(today, 1)];
    case "yesterday":
      return [addDays(today, -1), today];
    case "last_7":
      return [addDays(today, -6), addDays(today, 1)];
    case "last_30":
      return [addDays(today, -29), addDays(today, 1)];
    case "this_month":
      return [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1)];
    case "last_month":
      return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 1)];
    case "between": {
      const parse = (s?: string) => (s ? new Date(`${s}T00:00:00`) : null);
      const from = parse(values[0]);
      const to = parse(values[1]);
      return [from, to ? addDays(to, 1) : null];
    }
    default:
      return null;
  }
}

const isEmpty = (v: Value) => (Array.isArray(v) ? v.length === 0 : !v || !v.trim());

export function condComplete(field: AnyFilterField | undefined, cond: FilterCond): boolean {
  if (!field) return false;
  if (["empty", "not_empty", "is_true", "is_false", "today", "yesterday", "last_7", "last_30", "this_month", "last_month"].includes(cond.op)) return true;
  if (cond.op === "between") return Boolean(cond.values[0] || cond.values[1]);
  return cond.values.some((v) => v.trim());
}

function test<T>(field: FilterField<T>, cond: FilterCond, record: T): boolean {
  const v = field.get(record);
  if (cond.op === "empty") return isEmpty(v);
  if (cond.op === "not_empty") return !isEmpty(v);
  const list = Array.isArray(v) ? v : v ? [v] : [];
  switch (field.kind) {
    case "enum":
      if (cond.op === "in") return list.some((x) => cond.values.includes(x));
      if (cond.op === "not_in") return !list.some((x) => cond.values.includes(x));
      return true;
    case "bool": {
      const on = ["true", "1", "כן", "yes"].includes(String(v ?? "").toLowerCase());
      return cond.op === "is_true" ? on : !on;
    }
    case "number": {
      const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
      if (isEmpty(v) || Number.isNaN(n)) return false;
      const [a, b] = cond.values.map((x) => (x === "" ? NaN : Number(x)));
      if (cond.op === "eq") return n === a;
      if (cond.op === "gt") return n > a;
      if (cond.op === "lt") return n < a;
      if (cond.op === "between") return (Number.isNaN(a) || n >= a) && (Number.isNaN(b) || n <= b);
      return true;
    }
    case "date": {
      const range = dateRange(cond.op, cond.values);
      if (!range || isEmpty(v)) return false;
      const raw = String(v);
      const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw).getTime();
      if (Number.isNaN(t)) return false;
      return (!range[0] || t >= range[0].getTime()) && (!range[1] || t < range[1].getTime());
    }
    case "text": {
      const hay = list.join(" ").toLowerCase();
      const needle = (cond.values[0] ?? "").trim().toLowerCase();
      if (cond.op === "contains") return hay.includes(needle);
      if (cond.op === "not_contains") return !hay.includes(needle);
      if (cond.op === "eq") return hay === needle;
      return true;
    }
  }
}

// Compiles a filter once into a fast per-lead predicate. Incomplete
// conditions (no value picked yet) are ignored.
export function compileFilter<T>(filter: LeadFilter, fields: FilterField<T>[]): (record: T) => boolean {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const active = filter.conds.flatMap((cond) => {
    const field = byKey.get(cond.field);
    return field && condComplete(field, cond) ? [{ field, cond }] : [];
  });
  if (!active.length) return () => true;
  return filter.match === "all"
    ? (c) => active.every(({ field, cond }) => test(field, cond, c))
    : (c) => active.some(({ field, cond }) => test(field, cond, c));
}

const fmtDay = (s: string) => (s ? s.split("-").reverse().join("/") : "");

// Short human label for a condition chip, e.g. "סטטוס ליד: ללא מענה 1, טופל".
export function describeCond(field: AnyFilterField | undefined, cond: FilterCond): string {
  if (!field) return "";
  const opLabel = OPS[field.kind].find((o) => o.op === cond.op)?.label ?? "";
  if (field.kind === "enum" && (cond.op === "in" || cond.op === "not_in")) {
    const names = cond.values.map((v) => field.options?.find((o) => o.value === v)?.label ?? v);
    return `${field.label}${cond.op === "not_in" ? " לא" : ""}: ${names.join(", ")}`;
  }
  if (cond.op === "between") {
    const [a, b] = field.kind === "date" ? cond.values.map(fmtDay) : cond.values;
    return `${field.label}: ${a ? `מ־${a}` : ""}${a && b ? " " : ""}${b ? `עד ${b}` : ""}`;
  }
  if (["contains", "not_contains", "eq", "gt", "lt"].includes(cond.op)) return `${field.label} ${opLabel} ${cond.values[0] ?? ""}`;
  return `${field.label}: ${opLabel}`;
}

export const EMPTY_FILTER: LeadFilter = { match: "all", conds: [] };

// ── Other record types ───────────────────────────────────────────────────────

// Deals on one pipeline: the lead's own fields plus the deal's.
export function buildDealFilterFields(
  leadFields: FilterField[],
  contactOf: (o: Opportunity) => Contact | undefined,
  pipeline: Pipeline,
  lostReasons: string[] = []
): FilterField<Opportunity>[] {
  const group = "פרטי העסקה";
  const viaLead = leadFields
    .filter((f) => f.key !== "stage")
    .map((f): FilterField<Opportunity> => ({ ...f, get: (o) => { const c = contactOf(o); return c ? f.get(c) : undefined; } }));
  return [
    { key: "deal:stage", label: "שלב", group, kind: "enum", options: pipeline.stages.map((st) => ({ value: st.id, label: st.name })), get: (o) => o.stageId },
    { key: "deal:lostReason", label: "סיבת אי-סגירה", group, kind: "enum", options: lostReasons.map((r) => ({ value: r, label: r })), get: (o) => o.lostReason },
    { key: "deal:value", label: "שווי", group, kind: "number", get: (o) => (o.value ? String(o.value) : undefined) },
    { key: "deal:createdAt", label: "נפתחה ב", group, kind: "date", get: (o) => o.createdAt },
    { key: "deal:stageChangedAt", label: "עברה שלב ב", group, kind: "date", get: (o) => o.stageChangedAt },
    { key: "deal:title", label: "כותרת העסקה", group, kind: "text", get: (o) => o.title },
    ...viaLead,
  ];
}

const norm = (v: CrmRecord["data"][string] | undefined): Value => {
  if (v === null || v === undefined || v === "") return undefined;
  if (Array.isArray(v)) return v;
  return typeof v === "boolean" ? (v ? "true" : "false") : String(v);
};

// Records of a custom object (clients, properties…): every field the
// business defined on it.
export function buildRecordFilterFields(type: ObjectType, members: Member[]): FilterField<CrmRecord>[] {
  const memberOptions = members.filter((m) => m.status === "active").map((m) => ({ value: m.email, label: m.name }));
  const fields: FilterField<CrmRecord>[] = [];
  for (const f of [...type.fields].sort((a, b) => a.position - b.position)) {
    const key = `data:${f.key}`;
    const group = f.section || "פרטים";
    const get = (r: CrmRecord) => norm(r.data[f.key]);
    switch (f.type) {
      case "select":
      case "multi_select":
        fields.push({ key, label: f.label, group, kind: "enum", options: f.options.map((o) => ({ value: o.value, label: o.label })), get });
        break;
      case "user":
        fields.push({ key, label: f.label, group, kind: "enum", options: memberOptions, get });
        break;
      case "number":
      case "currency":
        fields.push({ key, label: f.label, group, kind: "number", get });
        break;
      case "date":
      case "datetime":
        fields.push({ key, label: f.label, group, kind: "date", get });
        break;
      case "checkbox":
        fields.push({ key, label: f.label, group, kind: "bool", get });
        break;
      case "relation":
      case "contact":
        break;
      default:
        fields.push({ key, label: f.label, group, kind: "text", get });
    }
  }
  fields.push({ key: "createdAt", label: "נוצר ב", group: "כללי", kind: "date", get: (r) => r.createdAt });
  fields.push({ key: "updatedAt", label: "עודכן ב", group: "כללי", kind: "date", get: (r) => r.updatedAt });
  return fields;
}

export function buildTaskFilterFields(contacts: Contact[], members: Member[]): FilterField<Task>[] {
  const group = "משימה";
  const nameOf = new Map(contacts.map((c) => [c.id, c.name]));
  return [
    { key: "state", label: "מצב", group, kind: "enum", options: [{ value: "open", label: "פתוחה" }, { value: "done", label: "הושלמה" }], get: (t) => (t.done ? "done" : "open") },
    { key: "dueDate", label: "תאריך יעד", group, kind: "date", get: (t) => t.dueDate },
    { key: "assignee", label: "אחראי", group, kind: "enum", options: members.map((m) => ({ value: m.name, label: m.name })), get: (t) => t.assignee },
    { key: "title", label: "כותרת", group, kind: "text", get: (t) => t.title },
    { key: "lead", label: "ליד", group, kind: "text", get: (t) => (t.contactId ? nameOf.get(t.contactId) : undefined) },
    { key: "createdAt", label: "נוצרה ב", group, kind: "date", get: (t) => t.createdAt },
  ];
}
