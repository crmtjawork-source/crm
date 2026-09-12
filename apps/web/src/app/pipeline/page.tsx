"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";
import { PipelineTable } from "@/components/PipelineTable";
import { downloadCsv } from "@/lib/exportCsv";

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

export default function PipelinePage() {
  const { pipelines, contacts, opportunities, addOpportunity, addPipeline } = useStore();
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  const [view, setView] = useState<"board" | "table">("board");
  const [showForm, setShowForm] = useState(false);
  const [contactId, setContactId] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");

  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  if (!pipeline) return null;

  function handleExport() {
    const rows = opportunities
      .filter((o) => o.pipelineId === pipeline!.id)
      .map((o) => {
        const contactName = contacts.find((c) => c.id === o.contactId)?.name ?? "";
        const stageName = pipeline!.stages.find((s) => s.id === o.stageId)?.name ?? "";
        return [o.title, contactName, stageName, String(o.value)];
      });
    downloadCsv(`${pipeline!.name}.csv`, ["כותרת", "ליד", "שלב", "שווי"], rows);
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

      {view === "board" ? <PipelineBoard pipeline={pipeline} /> : <PipelineTable pipeline={pipeline} />}
    </div>
  );
}
