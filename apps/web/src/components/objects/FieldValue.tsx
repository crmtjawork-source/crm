"use client";

import Link from "next/link";
import { formatValue, optionColor, optionLabel, type FieldValue as Value } from "@/lib/objects";
import type { Member, ObjectField } from "@/lib/types";

export function OptionChip({ field, value }: { field: ObjectField; value: Value }) {
  const color = optionColor(field, value);
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: `${color}22`, color }}>
      {optionLabel(field, value)}
    </span>
  );
}

// A field's value as shown in lists and on the record page.
export function FieldValue({
  field,
  value,
  members,
  recordTitles,
  contactNames,
  relationTypeId,
}: {
  field: ObjectField;
  value: Value;
  members?: Member[];
  recordTitles?: Record<string, string>;
  contactNames?: Record<string, string>;
  relationTypeId?: string;
}) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return <span className="text-neutral-300 dark:text-neutral-700">—</span>;
  switch (field.type) {
    case "select":
      return <OptionChip field={field} value={value} />;
    case "multi_select":
      return (
        <span className="inline-flex flex-wrap gap-1">
          {(Array.isArray(value) ? value : [value]).map((v) => (
            <OptionChip key={String(v)} field={field} value={v as string} />
          ))}
        </span>
      );
    case "phone":
      return (
        <a href={`tel:${String(value).replace(/[^\d+]/g, "")}`} className="hover:underline" dir="ltr" onClick={(e) => e.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${value}`} className="hover:underline" dir="ltr" onClick={(e) => e.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline break-all" dir="ltr" onClick={(e) => e.stopPropagation()}>
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    case "relation":
      return relationTypeId ? (
        <Link href={`/o/${relationTypeId}/${value}`} className="text-sky-600 hover:underline" onClick={(e) => e.stopPropagation()}>
          {recordTitles?.[String(value)] ?? "…"}
        </Link>
      ) : (
        <span>{recordTitles?.[String(value)] ?? "…"}</span>
      );
    case "contact":
      return (
        <Link href={`/contacts/${value}`} className="text-sky-600 hover:underline" onClick={(e) => e.stopPropagation()}>
          {contactNames?.[String(value)] ?? "ליד"}
        </Link>
      );
    case "long_text":
      return <span className="whitespace-pre-wrap">{String(value)}</span>;
    default:
      return <span>{formatValue(field, value, { members })}</span>;
  }
}
