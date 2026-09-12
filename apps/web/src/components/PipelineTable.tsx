"use client";

import { useState } from "react";
import Link from "next/link";
import type { Pipeline } from "@/lib/types";
import { useStore } from "@/lib/store";

export function PipelineTable({ pipeline }: { pipeline: Pipeline }) {
  const { opportunities, contacts, moveOpportunity, updateOpportunity, deleteOpportunity, members, currentMemberId } = useStore();
  const canDelete = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const rows = opportunities.filter((o) => o.pipelineId === pipeline.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");

  function startEdit(id: string, currentTitle: string, currentValue: number) {
    setEditingId(id);
    setTitle(currentTitle);
    setValue(String(currentValue || ""));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    updateOpportunity(editingId, { title: title.trim(), value: Number(value) || 0 });
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (confirm("למחוק את ההזדמנות הזו?")) deleteOpportunity(id);
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
          <tr>
            <th className="text-start px-4 py-2 font-medium">ליד</th>
            <th className="text-start px-4 py-2 font-medium">שלב</th>
            <th className="text-start px-4 py-2 font-medium">שווי</th>
            <th className="text-start px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) =>
            editingId === o.id ? (
              <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td colSpan={4} className="px-4 py-2">
                  <form onSubmit={save} className="flex items-center gap-2">
                    <input
                      autoFocus
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
              <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800 group">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${o.contactId}`} className="font-medium hover:underline">
                    {contacts.find((c) => c.id === o.contactId)?.name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={o.stageId}
                    onChange={(e) => moveOpportunity(o.id, e.target.value)}
                    className="text-neutral-600 dark:text-neutral-400 bg-transparent border-none outline-none cursor-pointer"
                  >
                    {pipeline.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {o.value > 0 ? `₪${o.value.toLocaleString("he-IL")}` : "—"}
                </td>
                <td className="px-4 py-3 text-left opacity-0 group-hover:opacity-100">
                  <button onClick={() => startEdit(o.id, o.title, o.value)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs me-2">
                    עריכה
                  </button>
                  {canDelete && (
                    <button onClick={() => handleDelete(o.id)} className="text-neutral-400 hover:text-red-500 text-xs">
                      מחיקה
                    </button>
                  )}
                </td>
              </tr>
            )
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                אין הזדמנויות בפייפליין הזה.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
