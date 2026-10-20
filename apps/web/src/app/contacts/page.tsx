"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ColorChip, colorAt } from "@/components/ui/ColorChip";
import { useAuth } from "@/lib/auth";
import { downloadCsv } from "@/lib/exportCsv";

const PAGE_SIZE = 100;

export default function ContactsPage() {
  const { contacts, members, campaigns, opportunities, pipelines, leadStatuses } = useStore();
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const isAgent = members.find((m) => m.email.toLowerCase() === (session?.user.email ?? "").toLowerCase())?.role === "agent";
  const [owner, setOwner] = useState(isAgent ? "mine" : "all"); // all | mine | none | <email>
  const [campaign, setCampaign] = useState(""); // "" all | "none" | <campaign id>
  const [sortBy, setSortBy] = useState<"activity" | "created">("activity");
  const [stageFilter, setStageFilter] = useState(""); // "" all | stage id | won | lost | abandoned | none
  const [statusFilter, setStatusFilter] = useState("");

  // Each lead's current deal: the open one if any, else the latest.
  const dealOf = new Map<string, (typeof opportunities)[number]>();
  for (const o of opportunities) {
    const cur = dealOf.get(o.contactId);
    if (!cur || (cur.status !== "open" && (o.status === "open" || o.createdAt > cur.createdAt))) dealOf.set(o.contactId, o);
  }
  const stageName = new Map(pipelines.flatMap((p) => p.stages.map((st) => [st.id, st.name] as const)));
  const stageColor = new Map(pipelines.flatMap((p) => p.stages.map((st, i) => [st.id, colorAt(st.color, i)] as const)));
  const statusColor = new Map(leadStatuses.map((st, i) => [st.name, colorAt(st.color, i)] as const));
  const OUTCOME_COLOR: Record<string, string> = { won: "#16a34a", lost: "#64748b", abandoned: "#94a3b8" };
  const stageChipColor = (contactId: string) => {
    const d = dealOf.get(contactId);
    return d ? (d.status === "open" ? stageColor.get(d.stageId) : OUTCOME_COLOR[d.status]) : undefined;
  };
  const OUTCOME: Record<string, string> = { won: "נסגרה עסקה", lost: "לא נסגרה עסקה", abandoned: "בוטלה עסקה" };
  const stageLabel = (contactId: string) => {
    const d = dealOf.get(contactId);
    if (!d) return "";
    return d.status === "open" ? stageName.get(d.stageId) ?? "" : OUTCOME[d.status];
  };
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
      if (statusFilter && (c.handlingStatus ?? "") !== (statusFilter === "none" ? "" : statusFilter)) return false;
      if (stageFilter) {
        const d = dealOf.get(c.id);
        if (stageFilter === "none") {
          if (d) return false;
        } else if (["won", "lost", "abandoned"].includes(stageFilter)) {
          if (d?.status !== stageFilter) return false;
        } else if (d?.status !== "open" || d.stageId !== stageFilter) return false;
      }
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.phone?.toLowerCase().includes(needle) ||
        c.email?.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => (sortBy === "activity" ? b.lastActivityAt.localeCompare(a.lastActivityAt) : b.createdAt.localeCompare(a.createdAt)));

  function handleExport() {
    downloadCsv(
      "לידים.csv",
      ["שם", "טלפון", "אימייל", "מקור", "בעלים", "תגיות"],
      filtered.map((c) => [c.name, c.phone ?? "", c.email ?? "", c.source ?? "", ownerName(c.ownerEmail), c.tags.join("; ")])
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">לידים</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="hidden md:inline-block text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            ייצוא CSV
          </button>
          <Link
            href="/contacts/import"
            className="hidden md:inline-block text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800"
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
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="חיפוש לפי שם, טלפון או אימייל…"
            className="w-full md:w-72 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
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
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          >
            <option value="">כל השלבים</option>
            {pipelines.flatMap((p) =>
              p.stages.map((st) => (
                <option key={st.id} value={st.id}>
                  {pipelines.length > 1 ? `${p.name} · ` : ""}
                  {st.name}
                </option>
              ))
            )}
            <option value="won">נסגרה עסקה</option>
            <option value="lost">לא נסגרה עסקה</option>
            <option value="abandoned">בוטלה עסקה</option>
          </select>
          {leadStatuses.length > 0 && (
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setVisible(PAGE_SIZE);
              }}
              className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            >
              <option value="">כל סטטוסי הליד</option>
              {leadStatuses.map((st) => (
                <option key={st.id} value={st.name}>
                  {st.name}
                </option>
              ))}
              <option value="none">ללא סטטוס</option>
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "activity" | "created")}
            className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          >
            <option value="activity">פעילות אחרונה</option>
            <option value="created">תאריך כניסה</option>
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
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">שלב</th>
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">סטטוס ליד</th>
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">מקור</th>
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">בעלים</th>
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">תגיות</th>
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
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 text-end md:text-start" dir="ltr">
                  {c.phone ? (
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                      {c.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                  <ColorChip label={stageLabel(c.id)} color={stageChipColor(c.id)} />
                </td>
                <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                  <ColorChip label={c.handlingStatus ?? ""} color={statusColor.get(c.handlingStatus ?? "")} />
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 hidden md:table-cell">{c.source ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 hidden md:table-cell">{ownerName(c.ownerEmail) || "—"}</td>
                <td className="px-4 py-3 hidden md:table-cell">
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
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
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
