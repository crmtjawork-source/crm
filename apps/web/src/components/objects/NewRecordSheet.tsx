"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { createRecord } from "@/lib/useRecords";
import type { FieldValue } from "@/lib/objects";
import type { CrmRecord, ObjectType } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { FieldInput } from "./FieldInput";

export function NewRecordSheet({
  type,
  initial = {},
  contactId,
  onClose,
  onCreated,
}: {
  type: ObjectType;
  initial?: CrmRecord["data"];
  contactId?: string;
  onClose: () => void;
  onCreated?: (r: CrmRecord) => void;
}) {
  const { orgId, members, currentMemberId } = useStore();
  const router = useRouter();
  const me = members.find((m) => m.id === currentMemberId);
  const [data, setData] = useState<CrmRecord["data"]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The short form: required fields and list columns; the rest on the record page.
  const fields = type.fields.filter((f) => f.required || f.showInList || f.key === type.titleField || initial[f.key] !== undefined);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const missing = type.fields.find((f) => f.required && (data[f.key] === undefined || data[f.key] === null || data[f.key] === ""));
    if (missing) return setError(`חסר: ${missing.label}`);
    setBusy(true);
    try {
      const rec = await createRecord(orgId, type, data, { contactId, ownerEmail: me?.email });
      if (onCreated) onCreated(rec);
      else router.push(`/o/${type.id}/${rec.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
      setBusy(false);
    }
  }

  return (
    <Sheet title={`${type.singular} חדש`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        {fields.map((f) => (
          <label key={f.id} className="block text-xs">
            <span className="block text-neutral-500 mb-1">
              {f.label}
              {f.required && " *"}
            </span>
            <FieldInput field={f} value={data[f.key] as FieldValue} onChange={(v) => setData((d) => ({ ...d, [f.key]: v as CrmRecord["data"][string] }))} />
          </label>
        ))}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50">
          {busy ? "שומר…" : "יצירה"}
        </button>
      </form>
    </Sheet>
  );
}
