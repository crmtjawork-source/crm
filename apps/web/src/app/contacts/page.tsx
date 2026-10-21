"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ColorChip, colorAt } from "@/components/ui/ColorChip";
import { useAuth } from "@/lib/auth";
import { downloadCsv } from "@/lib/exportCsv";
import { buildFilterFields, compileFilter, condComplete, describeCond, EMPTY_FILTER, type LeadFilter } from "@/lib/leadFilters";
import { LeadFilterPanel } from "@/components/leads/LeadFilterPanel";

const PAGE_SIZE = 100;

type SavedView = { name: string; filter: LeadFilter };

// The active filter survives leaving the list (per tab); saved views are kept
// per browser for each business.
function readJson<T>(storage: "local" | "session", key: string, fallback: T): T {
  try {
    const raw = (storage === "local" ? localStorage : sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(storage: "local" | "session", key: string, value: unknown) {
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — the filter just isn't remembered
  }
}

const formatEntered = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ContactsPage() {
  const { contacts, members, campaigns, opportunities, pipelines, leadStatuses, leadFields } = useStore();
  const { session, membership } = useAuth();
  const orgKey = membership?.orgId ?? "";
  const [q, setQ] = useState("");
  const isAgent = members.find((m) => m.email.toLowerCase() === (session?.user.email ?? "").toLowerCase())?.role === "agent";
  const [owner, setOwner] = useState(isAgent ? "mine" : "all"); // all | mine | none | <email>
  const [sortBy, setSortBy] = useState<"activity" | "created">("activity");
  const [filter, setFilterState] = useState<LeadFilter>(() => readJson("session", `crm-lead-filter:${orgKey}`, EMPTY_FILTER));
  const [views, setViewsState] = useState<SavedView[]>(() => readJson("local", `crm-lead-views:${orgKey}`, []));
  const [viewName, setViewName] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);

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

  const fields = useMemo(
    () => buildFilterFields({ contacts, leadFields, leadStatuses, pipelines, campaigns, members, dealOf }),
    [contacts, leadFields, leadStatuses, pipelines, campaigns, members, dealOf]
  );
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  const matches = useMemo(() => compileFilter(filter, fields), [filter, fields]);
  const activeConds = filter.conds.filter((c) => condComplete(fieldsByKey.get(c.field), c));

  function setFilter(f: LeadFilter, name = "") {
    setFilterState(f);
    setViewName(name);
    setVisible(PAGE_SIZE);
    writeJson("session", `crm-lead-filter:${orgKey}`, f);
  }
  function setViews(v: SavedView[]) {
    setViewsState(v);
    writeJson("local", `crm-lead-views:${orgKey}`, v);
  }
  function saveView() {
    const name = window.prompt("שם לתצוגה (למשל: לידים חדשים מהשבוע)", viewName)?.trim();
    if (!name) return;
    setViews([...views.filter((v) => v.name !== name), { name, filter }]);
    setViewName(name);
  }

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
          <button
            onClick={() => setPanelOpen(true)}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              activeConds.length ? "border-neutral-900 dark:border-white font-medium" : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            ⚲ סינון{activeConds.length ? ` (${activeConds.length})` : ""}
          </button>
          {views.length > 0 && (
            <select
              value={viewName}
              onChange={(e) => {
                const v = views.find((x) => x.name === e.target.value);
                setFilter(v?.filter ?? EMPTY_FILTER, v?.name ?? "");
              }}
              className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent max-w-48"
            >
              <option value="">תצוגות שמורות</option>
              {views.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
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

      {activeConds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 -mt-1 text-xs">
          {activeConds.map((c, i) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-neutral-400">{filter.match === "all" ? "וגם" : "או"}</span>}
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 ps-2.5 pe-1 py-1">
                <button onClick={() => setPanelOpen(true)} className="hover:underline">
                  {describeCond(fieldsByKey.get(c.field), c)}
                </button>
                <button
                  onClick={() => setFilter({ ...filter, conds: filter.conds.filter((x) => x.id !== c.id) })}
                  aria-label="הסרת התנאי"
                  className="text-neutral-400 hover:text-red-500 px-1"
                >
                  ×
                </button>
              </span>
            </span>
          ))}
          <button onClick={saveView} className="text-neutral-500 hover:underline ms-1">
            {viewName ? "עדכון התצוגה" : "שמירה כתצוגה"}
          </button>
          {viewName && (
            <button onClick={() => window.confirm(`למחוק את התצוגה "${viewName}"?`) && (setViews(views.filter((v) => v.name !== viewName)), setViewName(""))} className="text-neutral-400 hover:text-red-500 hover:underline">
              מחיקת התצוגה
            </button>
          )}
          <button onClick={() => setFilter(EMPTY_FILTER)} className="text-neutral-400 hover:underline">
            ניקוי
          </button>
        </div>
      )}

      {panelOpen && (
        <LeadFilterPanel
          fields={fields}
          filter={filter}
          onClose={() => setPanelOpen(false)}
          onApply={(f) => {
            setFilter(f, viewName);
            setPanelOpen(false);
          }}
        />
      )}

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
            <tr>
              <th className="text-start px-4 py-2 font-medium">שם</th>
              <th className="text-start px-4 py-2 font-medium">טלפון</th>
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">שלב</th>
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">סטטוס ליד</th>
              <th className="text-start px-4 py-2 font-medium hidden md:table-cell">תאריך כניסה</th>
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
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 hidden md:table-cell whitespace-nowrap" dir="ltr">
                  {formatEntered(c.createdAt)}
                </td>
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
