"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { matchesSearch, stageField, type FieldValue as Value } from "@/lib/objects";
import { recordTitles, updateRecord, useRecords } from "@/lib/useRecords";
import { FieldValue } from "@/components/objects/FieldValue";
import { NewRecordSheet } from "@/components/objects/NewRecordSheet";
import type { CrmRecord } from "@/lib/types";
import { buildRecordFilterFields } from "@/lib/leadFilters";
import { useRecordFilter } from "@/components/FilterBar";

const field = "px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

export default function ObjectListPage() {
  const { typeId } = useParams<{ typeId: string }>();
  const router = useRouter();
  const { objectTypes, members, contacts, loading } = useStore();
  const type = objectTypes.find((t) => t.id === typeId);
  const { records } = useRecords(type);
  const stage = type ? stageField(type) : undefined;
  const [view, setView] = useState<"list" | "board">("list");
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const ownerField = type?.fields.find((f) => f.type === "user");

  const columns = useMemo(() => (type ? type.fields.filter((f) => f.showInList && f.key !== type.titleField) : []), [type]);
  const filterFields = useMemo(() => (type ? buildRecordFilterFields(type, members) : []), [type, members]);
  const recordFilter = useRecordFilter(`object:${typeId}`, filterFields, `סינון ${type?.name ?? ""}`);
  const contactNames = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c.name])), [contacts]);

  useEffect(() => {
    if (!records || !type) return;
    const relKeys = type.fields.filter((f) => f.type === "relation").map((f) => f.key);
    if (!relKeys.length) return;
    recordTitles(records.flatMap((r) => relKeys.map((k) => String(r.data[k] ?? "")))).then(setTitles);
  }, [records, type]);

  if (!type) return <p className="text-sm text-neutral-400">{loading ? "טוען…" : "האובייקט לא נמצא."}</p>;

  const filtered = (records ?? []).filter(
    (r) =>
      matchesSearch(type, r, q.trim()) &&
      recordFilter.matches(r) &&
      (!stageFilter || r.data[stage!.key] === stageFilter) &&
      (!ownerFilter || r.data[ownerField!.key] === ownerFilter)
  );

  async function moveTo(r: CrmRecord, value: string) {
    if (!stage || r.data[stage.key] === value) return;
    await updateRecord(type!, r, { [stage.key]: value });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="text-2xl font-bold me-auto">
          {type.icon} {type.name}
          <span className="text-sm font-normal text-neutral-400 ms-2">{records ? filtered.length : ""}</span>
        </h1>
        {stage && (
          <div className="flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden text-sm">
            {(["list", "board"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>
                {v === "list" ? "רשימה" : "לוח"}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          + {type.singular} חדש
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש…" className={`${field} w-56`} />
        {stage && view === "list" && (
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={field}>
            <option value="">כל ה{stage.label === "שלב" ? "שלבים" : stage.label}</option>
            {stage.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {recordFilter.controls}
        {ownerField && (
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className={field}>
            <option value="">{ownerField.label}: כולם</option>
            {members
              .filter((m) => m.status === "active")
              .map((m) => (
                <option key={m.id} value={m.email}>
                  {m.name}
                </option>
              ))}
          </select>
        )}
      </div>

      {recordFilter.chips}

      {!records ? (
        <p className="text-sm text-neutral-400">טוען…</p>
      ) : view === "board" && stage ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {[...stage.options, { value: "", label: "ללא", color: "#94a3b8" }].map((o) => {
            const items = filtered.filter((r) => (r.data[stage.key] ?? "") === o.value);
            if (!o.value && !items.length) return null;
            return (
              <div
                key={o.value || "none"}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const r = filtered.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                  if (r && o.value) moveTo(r, o.value);
                }}
                className="w-64 shrink-0 bg-neutral-50 dark:bg-neutral-900 rounded-lg p-2"
              >
                <div className="flex items-center gap-2 px-1 mb-2 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />
                  {o.label}
                  <span className="text-xs text-neutral-400">{items.length}</span>
                </div>
                <div className="space-y-2 min-h-12">
                  {items.map((r) => (
                    <Link
                      key={r.id}
                      href={`/o/${type.id}/${r.id}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                      className="block bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-2 text-sm"
                    >
                      <p className="font-medium truncate">{r.title || "ללא שם"}</p>
                      {columns
                        .filter((c) => c.key !== stage.key)
                        .slice(0, 2)
                        .map((c) => (
                          <p key={c.id} className="text-xs text-neutral-500 truncate">
                            <FieldValue field={c} value={r.data[c.key] as Value} members={members} recordTitles={titles} contactNames={contactNames} relationTypeId={c.relationTypeId} />
                          </p>
                        ))}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-400">{records.length ? "אין תוצאות." : `עוד אין ${type.name}. לחצו על "${type.singular} חדש".`}</p>
      ) : (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="text-start font-medium px-3 py-2">{type.fields.find((f) => f.key === type.titleField)?.label ?? "שם"}</th>
                {columns.map((c) => (
                  <th key={c.id} className="text-start font-medium px-3 py-2 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/o/${type.id}/${r.id}`)} className="border-t border-neutral-100 dark:border-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.title || "ללא שם"}</td>
                  {columns.map((c) => (
                    <td key={c.id} className="px-3 py-2 whitespace-nowrap max-w-64 truncate">
                      <FieldValue field={c} value={r.data[c.key] as Value} members={members} recordTitles={titles} contactNames={contactNames} relationTypeId={c.relationTypeId} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewRecordSheet type={type} initial={stageFilter && stage ? { [stage.key]: stageFilter } : {}} onClose={() => setCreating(false)} />}
    </div>
  );
}
