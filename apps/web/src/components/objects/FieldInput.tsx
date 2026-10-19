"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import type { FieldValue } from "@/lib/objects";
import type { ObjectField } from "@/lib/types";

const input = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

// Picks a record of another object type by typing part of its name.
function RecordPicker({ typeId, value, onChange }: { typeId?: string; value: FieldValue; onChange: (v: FieldValue) => void }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [current, setCurrent] = useState<string>("");

  useEffect(() => {
    if (!value) return;
    supabase.from("records").select("title").eq("id", String(value)).maybeSingle().then(({ data }) => setCurrent(data?.title ?? ""));
  }, [value]);

  useEffect(() => {
    if (!typeId) return;
    const t = setTimeout(async () => {
      let query = supabase.from("records").select("id, title").eq("object_type_id", typeId).order("title").limit(20);
      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
      const { data } = await query;
      setOptions(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, typeId]);

  if (!typeId) return <p className="text-xs text-amber-600">לא נבחר לאיזה אובייקט השדה מקשר</p>;
  return (
    <div className="space-y-1">
      {value ? (
        <div className="flex items-center gap-2 text-sm">
          <span>{current || "…"}</span>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-neutral-400 hover:text-red-500">
            הסרה
          </button>
        </div>
      ) : null}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש…" className={input} />
      {(q || !value) && options.length > 0 && (
        <ul className="max-h-40 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-md">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setQ("");
                }}
                className="w-full text-start px-2 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                {o.title || "ללא שם"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactPicker({ value, onChange }: { value: FieldValue; onChange: (v: FieldValue) => void }) {
  const { contacts } = useStore();
  const [q, setQ] = useState("");
  const current = contacts.find((c) => c.id === value);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const digits = needle.replace(/\D/g, "");
    return contacts
      .filter((c) => c.name.toLowerCase().includes(needle) || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)))
      .slice(0, 15);
  }, [q, contacts]);
  return (
    <div className="space-y-1">
      {current && (
        <div className="flex items-center gap-2 text-sm">
          <span>{current.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-neutral-400 hover:text-red-500">
            הסרה
          </button>
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש ליד לפי שם או טלפון…" className={input} />
      {matches.length > 0 && (
        <ul className="max-h-40 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-md">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setQ("");
                }}
                className="w-full text-start px-2 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                {c.name} <span className="text-neutral-400 text-xs" dir="ltr">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The edit control for one field.
export function FieldInput({ field, value, onChange }: { field: ObjectField; value: FieldValue; onChange: (v: FieldValue) => void }) {
  const { members } = useStore();
  const str = value === null || value === undefined ? "" : String(value);
  switch (field.type) {
    case "long_text":
      return <textarea value={str} onChange={(e) => onChange(e.target.value)} rows={4} dir="auto" className={input} />;
    case "number":
    case "currency":
      return <input type="number" value={str} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={input} />;
    case "date":
      return <input type="date" value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} className={input} />;
    case "datetime":
      return (
        <input
          type="datetime-local"
          value={str ? new Date(str).toISOString().slice(0, 16) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          className={input}
        />
      );
    case "checkbox":
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />;
    case "select":
      return (
        <select value={str} onChange={(e) => onChange(e.target.value || null)} className={input}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multi_select": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((o) => {
            const on = list.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(on ? list.filter((v) => v !== o.value) : [...list, o.value])}
                className="text-xs px-2 py-1 rounded-full border"
                style={on ? { backgroundColor: `${o.color}22`, color: o.color, borderColor: o.color } : undefined}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "user":
      return (
        <select value={str} onChange={(e) => onChange(e.target.value || null)} className={input}>
          <option value="">—</option>
          {members
            .filter((m) => m.status === "active")
            .map((m) => (
              <option key={m.id} value={m.email}>
                {m.name}
              </option>
            ))}
        </select>
      );
    case "relation":
      return <RecordPicker typeId={field.relationTypeId} value={value} onChange={onChange} />;
    case "contact":
      return <ContactPicker value={value} onChange={onChange} />;
    case "phone":
      return <input type="tel" value={str} onChange={(e) => onChange(e.target.value)} dir="ltr" className={input} />;
    case "email":
      return <input type="email" value={str} onChange={(e) => onChange(e.target.value)} dir="ltr" className={input} />;
    case "url":
      return <input type="url" value={str} onChange={(e) => onChange(e.target.value)} dir="ltr" className={input} placeholder="https://" />;
    default:
      return <input value={str} onChange={(e) => onChange(e.target.value)} dir="auto" className={input} />;
  }
}
