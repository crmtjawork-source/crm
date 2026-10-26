"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { downloadCsv } from "@/lib/exportCsv";
import { buildFilterFields } from "@/lib/leadFilters";
import { useRecordFilter } from "@/components/FilterBar";
import { BackLink } from "@/components/BackLink";
import { StageSelect } from "@/components/leads/StageSelect";
import { useStageMovePrompt } from "@/components/leads/StageMovePrompt";
import { ColumnPicker } from "@/components/ColumnPicker";
import { buildLeadCols, formatEntered, useColumnPrefs, type LeadCol } from "@/lib/leadColumns";

const PAGE_SIZE = 100;

export default function ContactsPage() {
  const { contacts, members, campaigns, opportunities, pipelines, leadStatuses, leadFields } = useStore();
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const isAgent = members.find((m) => m.email.toLowerCase() === (session?.user.email ?? "").toLowerCase())?.role === "agent";
  const [owner, setOwner] = useState(isAgent ? "mine" : "all"); // all | mine | none | <email>
  const [sortBy, setSortBy] = useState<"activity" | "created">("activity");
  // Each lead's current deal: the open one if any, else the latest.
  const dealOf = useMemo(() => {
    const m = new Map<string, (typeof opportunities)[number]>();
    for (const o of opportunities) {
      const cur = m.get(o.contactId);
      if (!cur || (cur.status !== "open" && (o.status === "open" || o.createdAt > cur.createdAt))) m.set(o.contactId, o);
    }
    return m;
  }, [opportunities]);
  const stageName = new Map(pipelines.flatMap((p) => p.stages.map((st) => [st.id, st.name] as const)));
  const OUTCOME: Record<string, string> = { won: "נסגרה עסקה", lost: "לא נסגרה עסקה", abandoned: "בוטלה עסקה" };
  const stageLabel = (contactId: string) => {
    const d = dealOf.get(contactId);
    if (!d) return "";
    return d.status === "open" ? stageName.get(d.stageId) ?? "" : OUTCOME[d.status];
  };
  const [visible, setVisible] = useState(PAGE_SIZE);
  const stagePrompt = useStageMovePrompt();

  const catalog = buildLeadCols({
    leadFields,
    members,
    campaigns,
    extra: [
      {
        id: "stage",
        label: "שלב",
        group: "פרטי ליד",
        nowrap: true,
        cell: (c) => <StageSelect contact={c} deal={dealOf.get(c.id)} afterMove={stagePrompt.afterMove} />,
      } satisfies LeadCol,
    ],
  });
  const colPrefs = useColumnPrefs("leads", catalog, ["phone", "stage", "handlingStatus", "createdAt", "owner", "tags"]);

  const fields = useMemo(
    () => buildFilterFields({ contacts, leadFields, leadStatuses, pipelines, campaigns, members, dealOf }),
    [contacts, leadFields, leadStatuses, pipelines, campaigns, members, dealOf]
  );
  const { matches, controls: filterControls, chips: filterChips } = useRecordFilter("leads", fields, "סינון לידים");

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
      if (!matches(c)) return false;
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
      ["שם", "טלפון", "אימייל", "תאריך כניסה", "סטטוס ליד", "שלב", "בעלים", "תגיות"],
      filtered.map((c) => [c.name, c.phone ?? "", c.email ?? "", formatEntered(c.createdAt), c.handlingStatus ?? "", stageLabel(c.id), ownerName(c.ownerEmail), c.tags.join("; ")])
    );
  }

  return (
    <div className="p-4 md:p-6">
      <BackLink to="/pipeline" fallback="/pipeline" label="חזרה לפייפליין" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">לידים</h1>
        <div className="flex gap-2">
          <ColumnPicker catalog={catalog} ids={colPrefs.ids} onChange={colPrefs.setIds} onReset={colPrefs.reset} isDefault={colPrefs.isDefault} fixed="שם" />
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
          {filterControls}
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

      {filterChips}
      {stagePrompt.element}

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
            <tr>
              <th className="text-start px-4 py-2 font-medium">שם</th>
              {colPrefs.columns.map((col) => (
                <th key={col.id} className={`text-start px-4 py-2 font-medium ${col.mobile ? "" : "hidden md:table-cell"}`}>
                  {col.label}
                </th>
              ))}
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
                {colPrefs.columns.map((col) => (
                  <td key={col.id} className={`px-4 py-3 ${col.mobile ? "text-end md:text-start" : "hidden md:table-cell"} ${col.nowrap ? "whitespace-nowrap" : ""}`}>
                    {col.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colPrefs.columns.length + 1} className="px-4 py-6 text-center text-neutral-400">
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
