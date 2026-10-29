"use client";

import { useState, type ReactNode } from "react";
import { StatusSelect } from "@/components/leads/StatusSelect";
import { OwnerSelect } from "@/components/leads/OwnerSelect";
import { useAuth } from "@/lib/auth";
import type { Campaign, Contact, ObjectField, Opportunity } from "@/lib/types";

// A table column the user can show / hide / reorder. `cell` gets the lead (and
// the deal, on the pipeline table).
export type LeadCol = {
  id: string;
  label: string;
  group: string;
  mobile?: boolean; // stays visible on a phone
  nowrap?: boolean;
  cell: (c: Contact, o?: Opportunity) => ReactNode;
};

const dash = <span className="text-neutral-400">—</span>;
const muted = "text-neutral-600 dark:text-neutral-400";

export const formatEntered = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function fieldText(f: ObjectField, raw: string | undefined): string {
  if (!raw) return "";
  const label = (v: string) => f.options.find((o) => o.value === v)?.label ?? v;
  switch (f.type) {
    case "select":
      return label(raw);
    case "multi_select":
      return raw.split(/\s*,\s*/).filter(Boolean).map(label).join(", ");
    case "date":
      return new Date(raw).toLocaleDateString("he-IL");
    case "datetime":
      return formatEntered(raw);
    case "checkbox":
      return ["true", "1", "כן"].includes(raw.toLowerCase()) ? "כן" : "לא";
    case "number":
    case "currency":
      return Number.isFinite(Number(raw)) ? Number(raw).toLocaleString("he-IL") : raw;
    default:
      return raw;
  }
}

export function buildLeadCols({
  leadFields,
  campaigns,
  extra = [],
}: {
  leadFields: ObjectField[];
  campaigns: Campaign[];
  extra?: LeadCol[]; // table-specific columns (e.g. the lead's stage), listed first
}): LeadCol[] {
  const base = "פרטי ליד";
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name] as const));
  const text = (s?: string) => (s ? <span className={muted}>{s}</span> : dash);

  const cols: LeadCol[] = [
    ...extra,
    {
      id: "phone",
      label: "טלפון",
      group: base,
      mobile: true,
      cell: (c) =>
        c.phone ? (
          <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="hover:underline text-base font-bold tracking-wide text-neutral-900 dark:text-neutral-50">
            {c.phone}
          </a>
        ) : (
          dash
        ),
    },
    { id: "handlingStatus", label: "סטטוס ליד", group: base, nowrap: true, cell: (c) => <StatusSelect contact={c} /> },
    { id: "createdAt", label: "תאריך כניסה", group: base, nowrap: true, cell: (c) => <span dir="ltr" className={muted}>{formatEntered(c.createdAt)}</span> },
    { id: "lastActivityAt", label: "פעילות אחרונה", group: base, nowrap: true, cell: (c) => <span dir="ltr" className={muted}>{formatEntered(c.lastActivityAt)}</span> },
    { id: "owner", label: "בעלים", group: base, cell: (c) => <OwnerSelect contact={c} /> },
    { id: "campaign", label: "קמפיין", group: base, cell: (c) => text(c.campaignId ? campaignName.get(c.campaignId) : undefined) },
    { id: "source", label: "מקור", group: base, cell: (c) => text(c.source) },
    { id: "email", label: "אימייל", group: base, cell: (c) => text(c.email) },
    {
      id: "tags",
      label: "תגיות",
      group: base,
      cell: (c) => (
        <div className="flex gap-1 flex-wrap">
          {c.tags.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
              {t}
            </span>
          ))}
        </div>
      ),
    },
    { id: "noAnswerCount", label: "ניסיונות ללא מענה", group: base, cell: (c) => text(c.noAnswerCount ? String(c.noAnswerCount) : undefined) },
  ];

  for (const f of [...leadFields].sort((a, b) => a.position - b.position)) {
    if (f.type === "relation" || f.type === "long_text") continue;
    cols.push({ id: `field:${f.key}`, label: f.label, group: f.section || "שדות נוספים", cell: (c) => text(fieldText(f, c.fields[f.key])) });
  }
  return cols;
}

function read(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

// Which columns a table shows, in which order — remembered per person (in
// this browser) and per business. Columns that no longer exist are dropped.
export function useColumnPrefs(table: string, catalog: LeadCol[], defaults: string[]) {
  const { membership } = useAuth();
  const key = `crm-columns:${membership?.orgId ?? ""}:${table}`;
  const [saved, setSaved] = useState<string[] | null>(() => read(key));
  const known = new Map(catalog.map((c) => [c.id, c]));
  const ids = (saved ?? defaults).filter((id) => known.has(id));

  function setIds(next: string[] | null) {
    setSaved(next);
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
    } catch {
      // storage unavailable — the choice just isn't remembered
    }
  }
  return { ids, columns: ids.map((id) => known.get(id)!), setIds, reset: () => setIds(null), isDefault: saved === null };
}
