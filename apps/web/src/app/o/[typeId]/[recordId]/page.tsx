"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import { formatValue, stageField, type FieldValue as Value } from "@/lib/objects";
import { deleteRecord, mapRecord, recordTitles, updateRecord } from "@/lib/useRecords";
import { FieldValue } from "@/components/objects/FieldValue";
import { FieldInput } from "@/components/objects/FieldInput";
import { NewRecordSheet } from "@/components/objects/NewRecordSheet";
import type { CrmRecord, ObjectField, ObjectType } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const input = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

export default function RecordPage() {
  const { typeId, recordId } = useParams<{ typeId: string; recordId: string }>();
  const router = useRouter();
  const { objectTypes, members, contacts, currentMemberId, orgId, loading } = useStore();
  const type = objectTypes.find((t) => t.id === typeId);
  const [record, setRecord] = useState<CrmRecord | null | "missing">(null);
  const [editing, setEditing] = useState<CrmRecord["data"] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const me = members.find((m) => m.id === currentMemberId);
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const contactNames = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c.name])), [contacts]);

  useEffect(() => {
    supabase
      .from("records")
      .select("*")
      .eq("id", recordId)
      .maybeSingle()
      .then(({ data }) => setRecord(data ? mapRecord(data) : "missing"));
    const ch = supabase
      .channel(`record-${recordId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "records", filter: `id=eq.${recordId}` }, (p) => setRecord(mapRecord(p.new as Row)))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [recordId]);

  const rec = record && record !== "missing" ? record : null;
  useEffect(() => {
    if (!rec || !type) return;
    recordTitles(type.fields.filter((f) => f.type === "relation").map((f) => String(rec.data[f.key] ?? ""))).then(setTitles);
  }, [rec, type]);

  if (!type || record === null) return <p className="text-sm text-neutral-400">{loading || record === null ? "טוען…" : "האובייקט לא נמצא."}</p>;
  if (record === "missing") return <p className="text-sm text-neutral-400">הרשומה לא נמצאה (אולי נמחקה).</p>;
  const r = record;
  const stage = stageField(type);

  async function setStage(value: string) {
    if (!stage || r.data[stage.key] === value) return;
    const before = formatValue(stage, r.data[stage.key] as Value);
    setRecord(await updateRecord(type!, r, { [stage.key]: value }));
    await supabase.from("activities").insert({
      org_id: orgId,
      record_id: r.id,
      type: "stage_change",
      text: `${stage.label}: ${before ? `${before} ← ` : ""}${formatValue(stage, value)}${me ? ` (${me.name})` : ""}`,
    });
  }

  async function save() {
    if (!editing) return;
    const missing = type!.fields.find((f) => f.required && (editing[f.key] === undefined || editing[f.key] === null || editing[f.key] === ""));
    if (missing) return setError(`חסר: ${missing.label}`);
    try {
      setRecord(await updateRecord(type!, r, editing));
      setEditing(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  // Fields grouped by section, in order.
  const sections: { name: string; fields: ObjectField[] }[] = [];
  for (const f of type.fields) {
    if (f.key === stage?.key) continue;
    const name = f.section ?? "";
    const s = sections.find((x) => x.name === name) ?? sections[sections.push({ name, fields: [] }) - 1];
    s.fields.push(f);
  }

  return (
    <div className="max-w-5xl">
      <Link href={`/o/${type.id}`} className="text-xs text-neutral-400 hover:underline">
        ← {type.name}
      </Link>
      <div className="flex flex-wrap items-center gap-3 mt-1 mb-4">
        <h1 className="text-2xl font-bold me-auto">{r.title || "ללא שם"}</h1>
        {r.contactId && (
          <Link href={`/contacts/${r.contactId}`} className="text-sm text-sky-600 hover:underline">
            הליד: {contactNames[r.contactId] ?? "פתיחה"}
          </Link>
        )}
        {!editing ? (
          <button onClick={() => setEditing({ ...r.data })} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            עריכה
          </button>
        ) : (
          <>
            <button onClick={save} className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              שמירה
            </button>
            <button onClick={() => (setEditing(null), setError(""))} className="px-3 py-1.5 text-sm text-neutral-500">
              ביטול
            </button>
          </>
        )}
      </div>

      {stage && stage.options.length > 0 && (
        <div className="flex overflow-x-auto mb-6 rounded-lg border border-neutral-200 dark:border-neutral-800">
          {stage.options.map((o, i) => {
            const currentIdx = stage.options.findIndex((x) => x.value === r.data[stage.key]);
            const active = i === currentIdx;
            const passed = currentIdx >= 0 && i < currentIdx;
            return (
              <button
                key={o.value}
                onClick={() => setStage(o.value)}
                className="flex-1 min-w-28 px-3 py-2 text-xs whitespace-nowrap border-e last:border-e-0 border-neutral-200 dark:border-neutral-800 transition-colors"
                style={active ? { backgroundColor: o.color, color: "white" } : passed ? { backgroundColor: `${o.color}22`, color: o.color } : undefined}
                title={`מעבר ל"${o.label}"`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.name || "main"}>
              {s.name && <h2 className="text-sm font-semibold text-neutral-500 mb-2">{s.name}</h2>}
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
                {s.fields.map((f) => (
                  <div key={f.id} className={f.type === "long_text" ? "sm:col-span-2" : ""}>
                    <dt className="text-xs text-neutral-500 mb-0.5">
                      {f.label}
                      {editing && f.required && " *"}
                    </dt>
                    <dd className="text-sm">
                      {editing ? (
                        <FieldInput field={f} value={editing[f.key] as Value} onChange={(v) => setEditing((d) => ({ ...d!, [f.key]: v as CrmRecord["data"][string] }))} />
                      ) : (
                        <FieldValue field={f} value={r.data[f.key] as Value} members={members} recordTitles={titles} contactNames={contactNames} relationTypeId={f.relationTypeId} />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <RelatedRecords type={type} record={r} />
          {isAdmin && (
            <button
              onClick={async () => {
                if (!confirm(`למחוק את "${r.title}"? אי אפשר לשחזר.`)) return;
                await deleteRecord(r.id);
                router.push(`/o/${type.id}`);
              }}
              className="text-xs text-neutral-400 hover:text-red-500"
            >
              מחיקת ה{type.singular}
            </button>
          )}
        </div>
        <div className="space-y-6">
          <RecordTasks record={r} />
          <RecordTimeline record={r} />
        </div>
      </div>
    </div>
  );
}

// Records of other types that point at this one (e.g. clients of a property).
function RelatedRecords({ type, record }: { type: ObjectType; record: CrmRecord }) {
  const { objectTypes } = useStore();
  const links = objectTypes.flatMap((t) => t.fields.filter((f) => f.type === "relation" && f.relationTypeId === type.id).map((f) => ({ t, f })));
  const [rows, setRows] = useState<Record<string, CrmRecord[]>>({});
  const [adding, setAdding] = useState<{ t: ObjectType; f: ObjectField } | null>(null);

  const linkKey = links.map((l) => `${l.f.id}:${l.f.objectTypeId}:${l.f.key}`).join(",");
  const load = () => fetchRelated(record.id, linkKey).then(setRows);

  useEffect(() => {
    fetchRelated(record.id, linkKey).then(setRows);
  }, [record.id, linkKey]);

  if (!links.length) return null;
  return (
    <>
      {links.map(({ t, f }) => (
        <section key={f.id}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-neutral-500">
              {t.icon} {t.name} {f.label !== type.singular && <span className="font-normal">({f.label})</span>}
            </h2>
            <button onClick={() => setAdding({ t, f })} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
              + {t.singular}
            </button>
          </div>
          {(rows[f.id] ?? []).length === 0 ? (
            <p className="text-xs text-neutral-400">אין.</p>
          ) : (
            <ul className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-900">
              {rows[f.id].map((x) => (
                <li key={x.id}>
                  <Link href={`/o/${t.id}/${x.id}`} className="block px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    {x.title || "ללא שם"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {adding && (
        <NewRecordSheet
          type={adding.t}
          initial={{ [adding.f.key]: record.id }}
          onClose={() => setAdding(null)}
          onCreated={() => {
            setAdding(null);
            load();
          }}
        />
      )}
    </>
  );
}

async function fetchRelated(recordId: string, linkKey: string): Promise<Record<string, CrmRecord[]>> {
  const out: Record<string, CrmRecord[]> = {};
  for (const part of linkKey.split(",").filter(Boolean)) {
    const [fieldId, typeId, key] = part.split(":");
    const { data } = await supabase.from("records").select("*").eq("object_type_id", typeId).eq(`data->>${key}`, recordId).order("updated_at", { ascending: false }).limit(100);
    out[fieldId] = (data ?? []).map(mapRecord);
  }
  return out;
}

const fetchActivities = async (recordId: string) =>
  (await supabase.from("activities").select("*").eq("record_id", recordId).order("created_at", { ascending: false }).limit(200)).data ?? [];
const fetchTasks = async (recordId: string) =>
  (await supabase.from("tasks").select("*").eq("record_id", recordId).order("done").order("due_date", { nullsFirst: false })).data ?? [];

function RecordTimeline({ record }: { record: CrmRecord }) {
  const { orgId, members, currentMemberId } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const [items, setItems] = useState<Row[]>([]);
  const [text, setText] = useState("");

  const load = () => fetchActivities(record.id).then(setItems);
  useEffect(() => {
    fetchActivities(record.id).then(setItems);
  }, [record.id, record.updatedAt]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await supabase.from("activities").insert({ org_id: orgId, record_id: record.id, type: "note", text: `${text.trim()}${me ? `\n— ${me.name}` : ""}` });
    setText("");
    load();
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-500 mb-2">הערות והיסטוריה</h2>
      <form onSubmit={add} className="mb-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="הערה חדשה…" className={input} dir="auto" />
        <button type="submit" disabled={!text.trim()} className="mt-1 px-3 py-1 text-xs rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-40">
          הוספה
        </button>
      </form>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="text-sm border-s-2 border-neutral-200 dark:border-neutral-800 ps-3">
            <p className="whitespace-pre-wrap">{a.text}</p>
            <p className="text-[11px] text-neutral-400">{new Date(a.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecordTasks({ record }: { record: CrmRecord }) {
  const { orgId, members, currentMemberId } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const [items, setItems] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const load = () => fetchTasks(record.id).then(setItems);
  useEffect(() => {
    fetchTasks(record.id).then(setItems);
  }, [record.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await supabase.from("tasks").insert({ org_id: orgId, record_id: record.id, contact_id: record.contactId ?? null, title: title.trim(), due_date: due || null, assignee: me?.name ?? null });
    setTitle("");
    setDue("");
    load();
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-500 mb-2">משימות</h2>
      <form onSubmit={add} className="flex gap-1 mb-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="משימה חדשה…" className={input} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="px-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
        <button type="submit" className="px-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          +
        </button>
      </form>
      <ul className="space-y-1">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.done}
              onChange={async () => {
                await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
                load();
              }}
            />
            <span className={t.done ? "line-through text-neutral-400" : ""}>{t.title}</span>
            {t.due_date && <span className="text-xs text-neutral-400 ms-auto">{new Date(t.due_date).toLocaleDateString("he-IL")}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
