"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { apiPost } from "@/lib/api";
import { useStore } from "@/lib/store";

type Group = { id: string; name: string | null; jid: string; kind: string | null; participants_synced_at: string | null; participants_error: string | null; members: number };

const field = "px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent";

// The org defines what its WhatsApp groups are for (sales, operations…), tags each
// group, and the CRM matches lead phone numbers to the members of those groups.
export function WaGroupsSettings({ isAdmin }: { isAdmin: boolean }) {
  const { orgId } = useStore();
  const [kinds, setKinds] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [newKind, setNewKind] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [o, g, m] = await Promise.all([
      supabase.from("organizations").select("wa_group_kinds").eq("id", orgId).maybeSingle(),
      supabase.from("wa_groups").select("id, name, jid, kind, participants_synced_at, participants_error").eq("org_id", orgId).order("name"),
      supabase.from("wa_group_members").select("group_id").eq("org_id", orgId).limit(20000),
    ]);
    setKinds((o.data?.wa_group_kinds as string[]) ?? []);
    const counts = new Map<string, number>();
    for (const r of m.data ?? []) counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1);
    setGroups((g.data ?? []).map((x) => ({ ...x, members: counts.get(x.id) ?? 0 })));
  }, [orgId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function saveKinds(next: string[]) {
    setKinds(next);
    await apiPost("/api/org/settings", { waGroupKinds: next });
  }
  async function setKind(id: string, kind: string) {
    await supabase.from("wa_groups").update({ kind: kind || null }).eq("id", id);
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, kind: kind || null } : g)));
  }
  async function sync() {
    setBusy(true);
    setMsg("");
    try {
      const r = await apiPost<{ groups: number; members: number; errors: string[] }>("/api/wa-groups", {});
      setMsg(`נסרקו ${r.groups} קבוצות מתויגות, ${r.members} חברים.${r.errors.length ? " " + r.errors.join(" · ") : ""}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "הסנכרון נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">קבוצות וואטסאפ</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        מגדירים סוגי קבוצות (למשל מכירות, תפעול), מתייגים כל קבוצה מהוואטסאפ המחובר, והמערכת משייכת כל ליד לקבוצה לפי מספר הטלפון שלו — ומציגה את זה בכרטיס הליד. חברי קבוצה שהשער
        לא חושף את מספרם אפשר לשייך ידנית מכרטיס הליד.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 text-sm rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1">
            {k}
            {isAdmin && (
              <button onClick={() => saveKinds(kinds.filter((x) => x !== k))} className="text-neutral-400 hover:text-red-500" aria-label="הסרה">
                ×
              </button>
            )}
          </span>
        ))}
        {isAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newKind.trim() && !kinds.includes(newKind.trim())) void saveKinds([...kinds, newKind.trim()]);
              setNewKind("");
            }}
            className="flex gap-1"
          >
            <input value={newKind} onChange={(e) => setNewKind(e.target.value)} placeholder="סוג קבוצה חדש (למשל: מכירות)" className={field} />
            <button className="text-sm px-3 rounded-md bg-tint text-white">הוספה</button>
          </form>
        )}
      </div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">הקבוצות שהוואטסאפ המחובר רואה</h3>
        {isAdmin && (
          <button onClick={sync} disabled={busy} className="text-xs px-3 py-1.5 rounded-md bg-tint text-white disabled:opacity-50">
            {busy ? "סורק…" : "סנכרון חברי הקבוצות"}
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-neutral-500 mb-2">{msg}</p>}
      <ul className="space-y-1">
        {groups.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-2 text-sm bg-neutral-50 dark:bg-neutral-900 rounded-md px-3 py-2">
            <div className="min-w-0">
              <p className="truncate">{g.name ?? g.jid}</p>
              <p className="text-xs text-neutral-500">
                {g.kind ? `${g.members} חברים מזוהים` : "לא מתויגת"}
                {g.participants_error ? ` · ${g.participants_error}` : ""}
              </p>
            </div>
            <select disabled={!isAdmin} value={g.kind ?? ""} onChange={(e) => setKind(g.id, e.target.value)} className={field}>
              <option value="">לא מעקב</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </li>
        ))}
        {groups.length === 0 && <p className="text-sm text-neutral-400">עוד לא נקלטו קבוצות. קבוצות מופיעות כאן אחרי שהוואטסאפ המחובר מסנכרן שיחות (או לחצו על &quot;סנכרון&quot;).</p>}
      </ul>
    </section>
  );
}
