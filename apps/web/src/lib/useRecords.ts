"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { recordTitle } from "./objects";
import type { CrmRecord, ObjectType } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function mapRecord(r: Row): CrmRecord {
  return {
    id: r.id,
    objectTypeId: r.object_type_id,
    title: r.title,
    data: r.data ?? {},
    ownerEmail: r.owner_email ?? undefined,
    contactId: r.contact_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// The records of one object type, kept live.
export function useRecords(type: ObjectType | undefined) {
  const [records, setRecords] = useState<CrmRecord[] | null>(null);
  const typeId = type?.id;

  const load = useCallback(() => {
    if (typeId) fetchRecords(typeId).then(setRecords);
  }, [typeId]);

  useEffect(() => {
    if (!typeId) return;
    fetchRecords(typeId).then(setRecords);
    const channel = supabase
      .channel(`records-${typeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "records", filter: `object_type_id=eq.${typeId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Row).id;
          setRecords((rs) => rs?.filter((r) => r.id !== id) ?? rs);
          return;
        }
        const rec = mapRecord(payload.new as Row);
        setRecords((rs) => (rs ? [rec, ...rs.filter((r) => r.id !== rec.id)] : rs));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [typeId]);

  return { records, reload: load };
}

async function fetchRecords(typeId: string): Promise<CrmRecord[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("records").select("*").eq("object_type_id", typeId).order("updated_at", { ascending: false }).range(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows.map(mapRecord);
}

export async function createRecord(orgId: string, type: ObjectType, data: CrmRecord["data"], extra: { contactId?: string; ownerEmail?: string } = {}): Promise<CrmRecord> {
  const { data: row, error } = await supabase
    .from("records")
    .insert({ org_id: orgId, object_type_id: type.id, title: recordTitle(type, data), data, contact_id: extra.contactId ?? null, owner_email: extra.ownerEmail ?? null })
    .select()
    .single();
  if (error || !row) throw error ?? new Error("יצירת הרשומה נכשלה");
  return mapRecord(row);
}

// Merges changed values into the record (other fields untouched).
export async function updateRecord(type: ObjectType, record: CrmRecord, patch: CrmRecord["data"]): Promise<CrmRecord> {
  const data = { ...record.data, ...patch };
  const { data: row, error } = await supabase.from("records").update({ data, title: recordTitle(type, data) }).eq("id", record.id).select().single();
  if (error || !row) throw error ?? new Error("השמירה נכשלה");
  return mapRecord(row);
}

export async function deleteRecord(id: string): Promise<void> {
  const { error } = await supabase.from("records").delete().eq("id", id);
  if (error) throw error;
}

// Titles of records by id (for relation fields).
export async function recordTitles(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase.from("records").select("id, title").in("id", unique);
  return Object.fromEntries((data ?? []).map((r: Row) => [r.id, r.title]));
}
