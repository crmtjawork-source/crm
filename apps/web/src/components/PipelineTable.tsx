"use client";

import { useState } from "react";
import Link from "next/link";
import type { Opportunity, Pipeline } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useStageMovePrompt } from "@/components/leads/StageMovePrompt";
import { colorAt } from "@/components/ui/ColorChip";
import { ColumnPicker } from "@/components/ColumnPicker";
import { buildLeadCols, formatEntered, useColumnPrefs, type LeadCol } from "@/lib/leadColumns";

export function PipelineTable({ pipeline, search = "", filter }: { pipeline: Pipeline; search?: string; filter?: (o: Opportunity) => boolean }) {
  const { opportunities, contacts, moveOpportunity, updateOpportunity, updateContact, deleteOpportunity, members, currentMemberId, leadFields, campaigns, leadStatuses } = useStore();
  const stagePrompt = useStageMovePrompt();
  const canDelete = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const needle = search.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const rows = opportunities
    .filter((o) => o.pipelineId === pipeline.id && o.status === "open")
    .filter((o) => {
      if (filter && !filter(o)) return false;
      if (!needle) return true;
      const c = contacts.find((x) => x.id === o.contactId);
      return (c?.name ?? "").toLowerCase().includes(needle) || (digits.length >= 3 && (c?.phone ?? "").replace(/\D/g, "").includes(digits));
    })
    .sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt));
  const dealGroup = "פרטי העסקה";
  const catalog = buildLeadCols({
    leadFields,
    members,
    campaigns,
    extra: [
      {
        id: "stage",
        label: "שלב",
        group: dealGroup,
        mobile: true,
        nowrap: true,
        // Same coloured pill as on the leads list — here it's also the control that moves the deal.
        cell: (_c, o) => {
          if (!o) return null;
          const i = pipeline.stages.findIndex((st) => st.id === o.stageId);
          const color = colorAt(pipeline.stages[i]?.color, i);
          return (
            <span className="relative inline-flex items-center gap-1 rounded-full ps-2 pe-1 py-0.5 text-xs" style={{ backgroundColor: `${color}1f`, color }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <select
                value={o.stageId}
                aria-label="שלב"
                onChange={(e) => {
                  stagePrompt.afterMove(o.id, e.target.value);
                  moveOpportunity(o.id, e.target.value);
                }}
                className="appearance-none bg-transparent outline-none cursor-pointer pe-1 py-0.5 text-xs"
                style={{ color }}
              >
                {pipeline.stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </span>
          );
        },
      },
      { id: "value", label: "שווי", group: dealGroup, mobile: true, cell: (_c, o) => (o && o.value > 0 ? <span className="text-neutral-600 dark:text-neutral-400">₪{o.value.toLocaleString("he-IL")}</span> : <span className="text-neutral-400">—</span>) },
      { id: "dealCreated", label: "נפתחה ב", group: dealGroup, nowrap: true, cell: (_c, o) => (o ? <span dir="ltr" className="text-neutral-600 dark:text-neutral-400">{formatEntered(o.createdAt)}</span> : null) },
      { id: "stageChangedAt", label: "עברה שלב ב", group: dealGroup, nowrap: true, cell: (_c, o) => (o ? <span dir="ltr" className="text-neutral-600 dark:text-neutral-400">{formatEntered(o.stageChangedAt)}</span> : null) },
    ] satisfies LeadCol[],
  });
  const colPrefs = useColumnPrefs(`pipeline:${pipeline.id}`, catalog, ["phone", "stage", "handlingStatus", "createdAt", "owner", "tags", "value"]);
  const colSpan = colPrefs.columns.length + 2;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");

  function startEdit(id: string, currentName: string, currentValue: number) {
    setEditingId(id);
    setTitle(currentName);
    setValue(String(currentValue || ""));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const opp = opportunities.find((o) => o.id === editingId);
    const lead = contacts.find((c) => c.id === opp?.contactId);
    const newName = title.trim();
    // Renames the lead (that's what the row shows); the deal's title follows
    // when it was just the lead's name.
    if (opp && lead && newName && newName !== lead.name) {
      updateContact(lead.id, { name: newName });
      if (opp.title === lead.name) updateOpportunity(opp.id, { title: newName });
    }
    updateOpportunity(editingId, { value: Number(value) || 0 });
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (confirm("למחוק את ההזדמנות הזו?")) deleteOpportunity(id);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-neutral-500">{rows.length} עסקאות פתוחות</span>
        <ColumnPicker catalog={catalog} ids={colPrefs.ids} onChange={colPrefs.setIds} onReset={colPrefs.reset} isDefault={colPrefs.isDefault} fixed="ליד" />
      </div>
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
          <tr>
            <th className="text-start px-4 py-2 font-medium">ליד</th>
            {colPrefs.columns.map((col) => (
              <th key={col.id} className={`text-start px-4 py-2 font-medium ${col.mobile ? "" : "hidden md:table-cell"}`}>
                {col.label}
              </th>
            ))}
            <th className="text-start px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const lead = contacts.find((x) => x.id === o.contactId);
            return editingId === o.id ? (
              <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td colSpan={colSpan} className="px-4 py-2">
                  <form onSubmit={save} className="flex items-center gap-2">
                    <input
                      autoFocus
                      aria-label="שם הליד"
                      placeholder="שם הליד"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
                    />
                    <input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      type="number"
                      placeholder="שווי"
                      className="w-28 px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
                    />
                    <button type="submit" className="text-xs px-2 py-1 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                      שמירה
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs px-2 py-1 text-neutral-400">
                      ביטול
                    </button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 group">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${o.contactId}`} className="font-medium hover:underline">
                    {lead?.name ?? "—"}
                  </Link>
                </td>
                {colPrefs.columns.map((col) => (
                  <td key={col.id} className={`px-4 py-3 ${col.mobile ? "text-end md:text-start" : "hidden md:table-cell"} ${col.nowrap ? "whitespace-nowrap" : ""}`}>
                    {lead ? col.cell(lead, o) : null}
                  </td>
                ))}
                <td className="px-4 py-3 text-left whitespace-nowrap md:opacity-0 md:group-hover:opacity-100">
                  <button onClick={() => startEdit(o.id, lead?.name ?? o.title, o.value)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs me-2">
                    עריכה
                  </button>
                  {canDelete && (
                    <button onClick={() => handleDelete(o.id)} className="text-neutral-400 hover:text-red-500 text-xs">
                      מחיקה
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-6 text-center text-neutral-400">
                אין הזדמנויות פתוחות בפייפליין הזה.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {stagePrompt.element}
    </div>
  );
}
