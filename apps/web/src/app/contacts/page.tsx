"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { downloadCsv } from "@/lib/exportCsv";

export default function ContactsPage() {
  const { contacts } = useStore();
  const [q, setQ] = useState("");

  const filtered = contacts.filter((c) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      c.name.toLowerCase().includes(needle) ||
      c.phone?.toLowerCase().includes(needle) ||
      c.email?.toLowerCase().includes(needle)
    );
  });

  function handleExport() {
    downloadCsv(
      "לידים.csv",
      ["שם", "טלפון", "אימייל", "מקור", "תגיות"],
      filtered.map((c) => [c.name, c.phone ?? "", c.email ?? "", c.source ?? "", c.tags.join("; ")])
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">לידים</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            ייצוא CSV
          </button>
          <Link
            href="/contacts/import"
            className="text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            ייבוא CSV
          </Link>
          <Link
            href="/contacts/new"
            className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            + ליד חדש
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון או אימייל…"
          className="w-72 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        <span className="text-sm text-neutral-500">{filtered.length} מתוך {contacts.length}</span>
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
            <tr>
              <th className="text-start px-4 py-2 font-medium">שם</th>
              <th className="text-start px-4 py-2 font-medium">טלפון</th>
              <th className="text-start px-4 py-2 font-medium">מקור</th>
              <th className="text-start px-4 py-2 font-medium">תגיות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <td className="px-4 py-3">
                  <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400" dir="ltr">
                  {c.phone ?? "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{c.source ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  אין תוצאות.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
