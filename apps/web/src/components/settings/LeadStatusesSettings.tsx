"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { colorAt } from "@/components/ui/ColorChip";

export function LeadStatusesSettings({ isAdmin }: { isAdmin: boolean }) {
  const { leadStatuses, contacts, addLeadStatus, renameLeadStatus, deleteLeadStatus, moveLeadStatus, setLeadStatusColor } = useStore();
  const [name, setName] = useState("");
  const counts = new Map<string, number>();
  for (const c of contacts) if (c.handlingStatus) counts.set(c.handlingStatus, (counts.get(c.handlingStatus) ?? 0) + 1);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || leadStatuses.some((s) => s.name === name.trim())) return;
    await addLeadStatus(name.trim());
    setName("");
  }

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">סטטוסי טיפול</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        מצב הטיפול בליד, בנוסף לשלב בפייפליין — למשל &quot;ממתין לטיפול&quot;, &quot;ללא מענה 1&quot;, &quot;טופל&quot;. ליד חדש מקבל את
        הסטטוס הראשון ברשימה. אפשר להגדיר אוטומציה שרצה כשהסטטוס משתנה (מסך אוטומציות).
      </p>
      <ul className="space-y-1 mb-3">
        {leadStatuses.map((st, i) => (
          <StatusRow
            key={st.id}
            name={st.name}
            color={colorAt(st.color, i)}
            onColor={(c) => setLeadStatusColor(st.id, c)}
            count={counts.get(st.name) ?? 0}
            first={i === 0}
            last={i === leadStatuses.length - 1}
            isAdmin={isAdmin}
            onRename={(n) => renameLeadStatus(st.id, n)}
            onDelete={() => deleteLeadStatus(st.id)}
            onMove={(d) => moveLeadStatus(st.id, d)}
          />
        ))}
        {leadStatuses.length === 0 && <p className="text-sm text-neutral-400">אין סטטוסים — אפשר לעבוד גם בלי.</p>}
      </ul>
      {isAdmin && (
        <form onSubmit={add} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="סטטוס חדש" className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
      )}
    </section>
  );
}

function StatusRow(props: {
  name: string;
  color: string;
  onColor: (c: string) => void;
  count: number;
  first: boolean;
  last: boolean;
  isAdmin: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const [value, setValue] = useState(props.name);
  return (
    <li className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-800 rounded-md px-2 py-1 text-sm">
      <input
        type="color"
        value={props.color}
        onChange={(e) => props.onColor(e.target.value)}
        disabled={!props.isAdmin}
        className="h-6 w-7 shrink-0 cursor-pointer"
        title="צבע"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() && value !== props.name && props.onRename(value.trim())}
        disabled={!props.isAdmin}
        className="flex-1 bg-transparent px-1 py-0.5"
      />
      {props.first && <span className="text-[10px] text-neutral-400">ברירת מחדל</span>}
      <span className="text-xs text-neutral-400 w-14 text-end">{props.count} לידים</span>
      {props.isAdmin && (
        <>
          <button onClick={() => props.onMove(-1)} disabled={props.first} className="text-neutral-400 disabled:opacity-20" aria-label="למעלה">
            ▲
          </button>
          <button onClick={() => props.onMove(1)} disabled={props.last} className="text-neutral-400 disabled:opacity-20" aria-label="למטה">
            ▼
          </button>
          <button
            onClick={() => confirm(`למחוק את "${props.name}"? לידים בסטטוס הזה יישארו איתו עד שישנו אותו.`) && props.onDelete()}
            className="text-xs text-neutral-300 hover:text-red-500"
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}
