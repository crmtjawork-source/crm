"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import { mapRecord } from "@/lib/useRecords";
import { stageField, optionLabel, optionColor } from "@/lib/objects";
import type { Contact, CrmRecord, ObjectType } from "@/lib/types";
import { NewRecordSheet } from "@/components/objects/NewRecordSheet";

const fetchLinked = async (contactId: string) =>
  ((await supabase.from("records").select("*").eq("contact_id", contactId).order("created_at", { ascending: false })).data ?? []).map(mapRecord);

// What the lead became / is linked to: a client, a project… and creating one
// from the lead with its details filled in (lead → client conversion).
export function LeadRecords({ contact }: { contact: Contact }) {
  const { objectTypes, addNote } = useStore();
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [creating, setCreating] = useState<ObjectType | null>(null);

  useEffect(() => {
    fetchLinked(contact.id).then(setRecords);
  }, [contact.id]);

  if (!objectTypes.length) return null;

  function initialFor(type: ObjectType): CrmRecord["data"] {
    const data: CrmRecord["data"] = {};
    for (const f of type.fields) {
      if (f.key === type.titleField) data[f.key] = contact.name;
      else if (f.type === "phone" && contact.phone && !Object.values(data).includes(contact.phone)) data[f.key] = contact.phone;
      else if (f.type === "email" && contact.email && !Object.values(data).includes(contact.email)) data[f.key] = contact.email;
      else if (f.type === "contact") data[f.key] = contact.id;
      else if (f.type === "user" && contact.ownerEmail && !type.fields.some((x) => x.type === "user" && data[x.key])) data[f.key] = contact.ownerEmail;
    }
    // New records start at the first stage.
    const stage = stageField(type);
    if (stage?.options[0]) data[stage.key] = stage.options[0].value;
    return data;
  }

  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-neutral-500 me-auto">רשומות מקושרות</h2>
        {objectTypes.map((t) => (
          <button key={t.id} onClick={() => setCreating(t)} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
            + {t.icon} {t.singular} מהליד
          </button>
        ))}
      </div>
      {records.length === 0 ? (
        <p className="text-xs text-neutral-400">הליד עוד לא מקושר ל{objectTypes.map((t) => t.singular).join(" / ")}.</p>
      ) : (
        <ul className="space-y-1.5">
          {records.map((r) => {
            const type = objectTypes.find((t) => t.id === r.objectTypeId);
            const stage = type && stageField(type);
            const v = stage ? r.data[stage.key] : null;
            return (
              <li key={r.id}>
                <Link href={`/o/${r.objectTypeId}/${r.id}`} className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-sm">
                  <span>{type?.icon}</span>
                  <span className="text-neutral-500">{type?.singular}:</span>
                  <span className="font-medium truncate">{r.title}</span>
                  {stage && v && (
                    <span className="text-xs px-2 py-0.5 rounded-full ms-auto" style={{ backgroundColor: `${optionColor(stage, v as string)}22`, color: optionColor(stage, v as string) }}>
                      {optionLabel(stage, v as string)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {creating && (
        <NewRecordSheet
          type={creating}
          initial={initialFor(creating)}
          contactId={contact.id}
          onClose={() => setCreating(null)}
          onCreated={async () => {
            setCreating(null);
            await addNote(contact.id, `🔁 נוצר/ה ${creating.singular} מהליד`);
            fetchLinked(contact.id).then(setRecords);
          }}
        />
      )}
    </section>
  );
}
