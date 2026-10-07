"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { downloadCsv } from "@/lib/exportCsv";

const PAGE_SIZE = 100;

export default function ContactsPage() {
  const { contacts, members, campaigns } = useStore();
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all"); // all | mine | none | <email>
  const [campaign, setCampaign] = useState(""); // "" all | "none" | <campaign id>
  const [visible, setVisible] = useState(PAGE_SIZE);

  const myEmail = session?.user.email?.toLowerCase() ?? "";
  const ownerName = (email?: string) =>
    email ? members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.name ?? email : "";

  const needle = q.trim().toLowerCase();
  const filtered = contacts
    .filter((c) => {
      const ownerEmail = c.ownerEmail?.toLowerCase() ?? "";
      if (owner === "mine" && ownerEmail !== myEmail) return false;
      if (owner === "none" && ownerEmail) return false;
      if (!["all", "mine", "none"].includes(owner) && ownerEmail !== owner) return false;
      if (campaign === "none" && c.campaignId) return false;
      if (campaign && campaign !== "none" && c.campaignId !== campaign) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.phone?.toLowerCase().includes(needle) ||
        c.email?.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function handleExport() {
    downloadCsv(
      "לידים.csv",
      ["שם", "טלפון", "אימייל", "מקור", "בעלים", "תגיות"],
      filtered.map((c) => [c.name, c.phone ?? "", c.email ?? "", c.source ?? "", ownerName(c.ownerEmail), c.tags.join("; ")])
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

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="חיפוש לפי שם, טלפון או אימייל…"
            className="w-72 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
          <select
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          >
            <option value="all">כל הלידים</option>
            <option value="mine">הלידים שלי</option>
            <option value="none">ללא בעלים</option>
            {members.map((m) => (
              <option key={m.id} value={m.email.toLowerCase()}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={campaign}
            onChange={(e) => {
              setCampaign(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent max-w-56"
          >
            <option value="">כל הקמפיינים</option>
            <option value="none">ללא קמפיין</option>
            {campaigns
              .filter((c) => !c.archived)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <span className="text-sm text-neutral-500">{filtered.length} מתוך {contacts.length}</span>
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
            <tr>
              <th className="text-start px-4 py-2 font-medium">שם</th>
              <th className="text-start px-4 py-2 font-medium">טלפון</th>
              <th className="text-start px-4 py-2 font-medium">מקור</th>
              <th className="text-start px-4 py-2 font-medium">בעלים</th>
              <th className="text-start px-4 py-2 font-medium">תגיות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((c) => (
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
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{ownerName(c.ownerEmail) || "—"}</td>
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
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  אין תוצאות.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > visible && (
        <button
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="mt-3 w-full text-sm py-2 rounded-md border border-neutral-200 dark:border-neutral-800 text-neutral-500"
        >
          הצגת עוד {Math.min(PAGE_SIZE, filtered.length - visible)} (מוצגים {visible} מתוך {filtered.length})
        </button>
      )}
    </div>
  );
}
