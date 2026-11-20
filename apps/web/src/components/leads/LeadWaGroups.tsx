"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import { normalizePhone } from "@/lib/phone";
import type { Contact } from "@/lib/types";

type Group = { id: string; name: string | null; kind: string | null };
type Member = { id: string; group_id: string; source: string };

// Which of the org's WhatsApp groups (sales, operations…) this lead is in:
// matched by phone number, or linked by hand. Renders nothing until the org
// has defined group kinds.
export function LeadWaGroups({ contact }: { contact: Contact }) {
  const { orgId } = useStore();
  const [kinds, setKinds] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const phone = normalizePhone(contact.phone);

  const load = useCallback(async () => {
    const [o, g] = await Promise.all([
      supabase.from("organizations").select("wa_group_kinds").eq("id", orgId).maybeSingle(),
      supabase.from("wa_groups").select("id, name, kind").eq("org_id", orgId).not("kind", "is", null),
    ]);
    setKinds((o.data?.wa_group_kinds as string[]) ?? []);
    setGroups((g.data as Group[]) ?? []);
    const ors = [`contact_id.eq.${contact.id}`, ...(phone ? [`phone_digits.eq.${phone}`] : [])].join(",");
    const m = await supabase.from("wa_group_members").select("id, group_id, source").eq("org_id", orgId).or(ors);
    setMembers((m.data as Member[]) ?? []);
  }, [orgId, contact.id, phone]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (kinds.length === 0 && groups.length === 0) return null;
  const allKinds = [...new Set([...kinds, ...groups.map((g) => g.kind!).filter(Boolean)])];

  async function link(groupId: string) {
    if (!groupId) return;
    await supabase.from("wa_group_members").insert({ org_id: orgId, group_id: groupId, contact_id: contact.id, source: "manual" });
    await load();
  }
  async function unlink(id: string) {
    await supabase.from("wa_group_members").delete().eq("id", id);
    await load();
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm px-4 py-3 mb-4 text-sm">
      <p className="text-xs text-neutral-500 mb-2">קבוצות וואטסאפ</p>
      <ul className="space-y-1.5">
        {allKinds.map((kind) => {
          const ofKind = groups.filter((g) => g.kind === kind);
          const mine = members.filter((m) => ofKind.some((g) => g.id === m.group_id));
          const free = ofKind.filter((g) => !mine.some((m) => m.group_id === g.id));
          return (
            <li key={kind} className="flex flex-wrap items-center gap-2">
              <span className="text-neutral-500 min-w-16">{kind}:</span>
              {mine.length > 0 ? (
                mine.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-0.5 text-xs" title={m.source === "manual" ? "שויך ידנית" : "זוהה לפי מספר הטלפון"}>
                    ✓ {ofKind.find((g) => g.id === m.group_id)?.name ?? "קבוצה"}
                    {m.source === "manual" && (
                      <button onClick={() => unlink(m.id)} className="text-emerald-700/60 hover:text-red-500" aria-label="הסרת שיוך">
                        ×
                      </button>
                    )}
                  </span>
                ))
              ) : (
                <span className="text-xs text-neutral-400">לא בקבוצה</span>
              )}
              {free.length > 0 && (
                <select value="" onChange={(e) => link(e.target.value)} className="text-xs px-1.5 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent">
                  <option value="">+ שיוך לקבוצה</option>
                  {free.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name ?? "קבוצה"}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
