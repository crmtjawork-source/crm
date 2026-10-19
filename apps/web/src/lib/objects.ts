import type { Member, ObjectField, ObjectType, CrmRecord } from "./types";

// Custom objects: record types a business defines for itself.

export const FIELD_TYPES: { id: ObjectField["type"]; label: string }[] = [
  { id: "text", label: "טקסט" },
  { id: "long_text", label: "טקסט ארוך" },
  { id: "number", label: "מספר" },
  { id: "currency", label: "סכום (₪)" },
  { id: "date", label: "תאריך" },
  { id: "datetime", label: "תאריך ושעה" },
  { id: "select", label: "בחירה מרשימה" },
  { id: "multi_select", label: "בחירה מרובה" },
  { id: "checkbox", label: "כן / לא" },
  { id: "phone", label: "טלפון" },
  { id: "email", label: "אימייל" },
  { id: "url", label: "קישור" },
  { id: "relation", label: "קישור לרשומה אחרת" },
  { id: "contact", label: "קישור לליד" },
  { id: "user", label: "איש צוות" },
];

export const OPTION_COLORS = ["#64748b", "#2563eb", "#0891b2", "#059669", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed"];

export const newKey = () => `f_${Math.random().toString(36).slice(2, 8)}`;

export type FieldValue = string | number | boolean | string[] | null | undefined;

export function optionLabel(field: ObjectField, value: FieldValue): string {
  return field.options.find((o) => o.value === value)?.label ?? String(value ?? "");
}

export function optionColor(field: ObjectField, value: FieldValue): string {
  return field.options.find((o) => o.value === value)?.color ?? OPTION_COLORS[0];
}

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

// Plain-text rendering of a value (lists, exports, titles).
export function formatValue(field: ObjectField, value: FieldValue, ctx: { members?: Member[]; recordTitles?: Record<string, string>; contactNames?: Record<string, string> } = {}): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return "";
  switch (field.type) {
    case "currency":
      return Number.isFinite(Number(value)) ? ils.format(Number(value)) : String(value);
    case "number":
      return Number.isFinite(Number(value)) ? Number(value).toLocaleString("he-IL") : String(value);
    case "date":
      return new Date(String(value)).toLocaleDateString("he-IL");
    case "datetime":
      return new Date(String(value)).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
    case "checkbox":
      return value ? "כן" : "לא";
    case "select":
      return optionLabel(field, value);
    case "multi_select":
      return (Array.isArray(value) ? value : [value]).map((v) => optionLabel(field, v as string)).join(", ");
    case "user":
      return ctx.members?.find((m) => m.email === value)?.name ?? String(value);
    case "relation":
      return ctx.recordTitles?.[String(value)] ?? "…";
    case "contact":
      return ctx.contactNames?.[String(value)] ?? "…";
    default:
      return String(value);
  }
}

export function recordTitle(type: ObjectType, data: Record<string, FieldValue>): string {
  const field = type.fields.find((f) => f.key === type.titleField) ?? type.fields[0];
  return field ? formatValue(field, data[field.key]) : "";
}

export function stageField(type: ObjectType): ObjectField | undefined {
  return type.fields.find((f) => f.key === type.stageField && f.type === "select");
}

// Text search over a record's text-like values.
export function matchesSearch(type: ObjectType, r: CrmRecord, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (r.title.toLowerCase().includes(needle)) return true;
  return type.fields.some((f) => {
    const v = r.data[f.key];
    if (v == null) return false;
    const text = f.type === "select" || f.type === "multi_select" ? formatValue(f, v) : String(v);
    return text.toLowerCase().includes(needle);
  });
}

// Ready-made starting points; everything stays editable afterwards.
type Preset = { id: string; name: string; singular: string; icon: string; fields: Omit<ObjectField, "id" | "objectTypeId" | "position">[]; titleKey: string; stageKey?: string };

const opts = (labels: string[]) => labels.map((l, i) => ({ value: newKey(), label: l, color: OPTION_COLORS[(i + 1) % OPTION_COLORS.length] }));
const f = (key: string, label: string, type: ObjectField["type"], extra: Partial<ObjectField> = {}) => ({ key, label, type, options: [], required: false, showInList: false, ...extra });

export const OBJECT_PRESETS: Preset[] = [
  { id: "blank", name: "", singular: "", icon: "📁", titleKey: "name", fields: [f("name", "שם", "text", { required: true, showInList: true })] },
  {
    id: "clients",
    name: "לקוחות",
    singular: "לקוח",
    icon: "🤝",
    titleKey: "name",
    stageKey: "stage",
    fields: [
      f("name", "שם", "text", { required: true, showInList: true }),
      f("stage", "שלב", "select", { showInList: true, options: opts(["חדש", "בתהליך", "פעיל", "הסתיים"]) }),
      f("phone", "טלפון", "phone", { showInList: true }),
      f("email", "אימייל", "email"),
      f("owner", "מנהל לקוח", "user", { showInList: true }),
      f("lead", "הליד המקורי", "contact"),
      f("value", "שווי", "currency"),
      f("notes", "הערות", "long_text"),
    ],
  },
  {
    id: "properties",
    name: "נכסים",
    singular: "נכס",
    icon: "🏠",
    titleKey: "name",
    stageKey: "status",
    fields: [
      f("name", "שם הנכס", "text", { required: true, showInList: true }),
      f("status", "סטטוס", "select", { showInList: true, options: opts(["בשוק", "בטיפול", "נמכר", "הושכר", "לא רלוונטי"]) }),
      f("city", "עיר", "text", { showInList: true }),
      f("address", "כתובת", "text"),
      f("price", "מחיר", "currency", { showInList: true }),
      f("rooms", "חדרים", "number"),
      f("size", "מ\"ר", "number"),
      f("description", "תיאור", "long_text"),
    ],
  },
  {
    id: "projects",
    name: "פרויקטים",
    singular: "פרויקט",
    icon: "📋",
    titleKey: "name",
    stageKey: "stage",
    fields: [
      f("name", "שם", "text", { required: true, showInList: true }),
      f("stage", "שלב", "select", { showInList: true, options: opts(["תכנון", "בביצוע", "ממתין", "הושלם"]) }),
      f("owner", "אחראי", "user", { showInList: true }),
      f("due", "תאריך יעד", "date", { showInList: true }),
      f("budget", "תקציב", "currency"),
      f("lead", "לקוח (ליד)", "contact"),
    ],
  },
];
