"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";
import { PipelineTable } from "@/components/PipelineTable";
import { downloadCsv } from "@/lib/exportCsv";
import { buildDealFilterFields, buildFilterFields } from "@/lib/leadFilters";
import { useRecordFilter } from "@/components/FilterBar";
import { needsAssignment } from "@/components/leads/OwnerSelect";
import { canAssignLeads, effectiveRole } from "@/lib/permissions";

// @dnd-kit's internal id generator (useUniqueId) is a module-level counter
// that never resets between requests on a long-lived server process, so
// its SSR output drifts from a fresh client render and React logs a
// (harmless but noisy) hydration mismatch on the aria-describedby it
// generates. The board is an internal, auth-gated tool with nothing worth
// server-rendering anyway, so skipping SSR for it sidesteps the mismatch
// at the root instead of chasing dnd-kit internals.
const PipelineBoard = dynamic(() => import("@/components/PipelineBoard").then((m) => m.PipelineBoard), {
  ssr: false,
  loading: () => <div className="text-sm text-neutral-400 p-6">טוען…</div>,
});

const remembered = (key: string): string | null => {
  try {
    return sessionStorage.getItem(`crm-pipeline-${key}`);
  } catch {
    return null;
  }
};
const remember = (key: string, value: string) => {
  try {
    sessionStorage.setItem(`crm-pipeline-${key}`, value);
  } catch {
    // storage unavailable — just not remembered
  }
};

export default function PipelinePage() {
  const { pipelines, contacts, opportunities, addOpportunity, addPipeline, members, campaigns, leadStatuses, leadFields, currentMemberId, roles, lostReasons } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const unassigned = canAssignLeads(me, effectiveRole(me, roles)) ? contacts.filter(needsAssignment).length : 0;
  // Kanban / table, the pipeline and the search are remembered for this tab,
  // so going back from a lead's card returns to exactly what was on screen.
  const [pipelineId, setPipelineIdState] = useState(() => remembered("pipeline") ?? pipelines[0]?.id ?? "");
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  const [view, setViewState] = useState<"board" | "table">(() => (remembered("view") === "table" ? "table" : "board"));
  const [search, setSearchState] = useState(() => remembered("search") ?? "");
  const setPipelineId = (v: string) => (setPipelineIdState(v), remember("pipeline", v));
  const setView = (v: "board" | "table") => (setViewState(v), remember("view", v));
  const setSearch = (v: string) => (setSearchState(v), remember("search", v));
  const [showForm, setShowForm] = useState(false);
  const [contactId, setContactId] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");

  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  const filterFields = useMemo(() => {
    const leadSide = buildFilterFields({ contacts, leadFields, leadStatuses, pipelines, campaigns, members, dealOf: new Map() });
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return buildDealFilterFields(leadSide, (o) => byId.get(o.contactId), pipeline ?? { id: "", name: "", stages: [] }, lostReasons);
  }, [contacts, leadFields, leadStatuses, pipelines, campaigns, members, pipeline, lostReasons]);
  const dealFilter = useRecordFilter(`pipeline:${pipeline?.id ?? ""}`, filterFields, "סינון עסקאות");

  if (!pipeline) return null;

  function handleExport() {
    const rows = opportunities
      .filter((o) => o.pipelineId === pipeline!.id)
      .map((o) => {
        const contactName = contacts.find((c) => c.id === o.contactId)?.name ?? "";
        const stageName = pipeline!.stages.find((s) => s.id === o.stageId)?.name ?? "";
        const outcome = { open: "פתוחה", won: "נסגרה", lost: "לא נסגרה", abandoned: "בוטלה" }[o.status];
        return [o.title, contactName, stageName, String(o.value), outcome, o.lostReason ?? ""];
      });
    downloadCsv(`${pipeline!.name}.csv`, ["כותרת", "ליד", "שלב", "שווי", "תוצאה", "סיבה"], rows);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId || !pipeline) return;
    const contactName = contacts.find((c) => c.id === contactId)?.name ?? "";
    await addOpportunity({
      contactId,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      title: title.trim() || contactName,
      value: Number(value) || 0,
    });
    setContactId("");
    setTitle("");
    setValue("");
    setShowForm(false);
  }

  async function handleNewPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPipelineName.trim()) return;
    const created = await addPipeline(newPipelineName.trim());
    setPipelineId(created.id);
    setNewPipelineName("");
    setShowNewPipeline(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select
            value={pipeline.id}
            onChange={(e) => setPipelineId(e.target.value)}
            className="text-xl font-bold bg-transparent border-none outline-none cursor-pointer"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowNewPipeline((v) => !v)}
            className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline"
          >
            + פייפליין חדש
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden text-sm">
            <button
              onClick={() => setView("board")}
              className={`px-3 py-1.5 ${view === "board" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
            >
              קנבן
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-3 py-1.5 ${view === "table" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
            >
              טבלה
            </button>
          </div>
          <Link href="/contacts" className="text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800" title="כל הלידים, כולל אלה בלי עסקה פתוחה">
            כל הלידים
          </Link>
          <Link href="/contacts/new" className="text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800">
            + ליד חדש
          </Link>
          <button
            onClick={handleExport}
            className="text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            ייצוא CSV
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            + הזדמנות חדשה
          </button>
        </div>
      </div>

      {showNewPipeline && (
        <form onSubmit={handleNewPipeline} className="mb-4 flex items-end gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
          <label className="text-sm flex-1">
            <span className="block text-xs text-neutral-500 mb-1">שם הפייפליין החדש</span>
            <input
              autoFocus
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder="לדוגמה: פייפליין השכרות"
              className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            יצירה
          </button>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">ליד</span>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              required
              className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            >
              <option value="">בחירה…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">כותרת (אופציונלי)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">שווי (₪)</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type="number"
              className="w-28 px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
      )}

      {unassigned > 0 && (
        <Link href="/contacts?new=1" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/50">
          <span>⚠</span>
          <span className="flex-1">{unassigned} לידים חדשים ממתינים לשיוך לנציג</span>
          <span className="text-xs underline">הצגה ‹</span>
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש בפייפליין לפי שם או טלפון…"
          className="w-full sm:w-72 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        {dealFilter.controls}
      </div>
      {dealFilter.chips}
      {search.trim() && (
        <p className="mb-3 text-xs text-neutral-500">
          מוצגות תוצאות החיפוש בפייפליין הזה (עסקאות פתוחות) — הסינון לא חל בזמן חיפוש.{" "}
          <Link href={`/contacts?q=${encodeURIComponent(search.trim())}`} className="underline">
            חיפוש בכל הלידים, כולל סגורים ובפייפליינים אחרים
          </Link>
        </p>
      )}
      {view === "board" ? (
        <PipelineBoard pipeline={pipeline} search={search} filter={dealFilter.matches} />
      ) : (
        <PipelineTable pipeline={pipeline} search={search} filter={dealFilter.matches} />
      )}
    </div>
  );
}
