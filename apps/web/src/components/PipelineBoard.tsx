"use client";

import { useState } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import type { Pipeline, Opportunity, Contact } from "@/lib/types";
import { useStore } from "@/lib/store";

function OpportunityCard({ opp, contactName }: { opp: Opportunity; contactName: string }) {
  const { updateOpportunity, deleteOpportunity, members, currentMemberId } = useStore();
  const canDelete = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(opp.title);
  const [value, setValue] = useState(String(opp.value || ""));

  function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    updateOpportunity(opp.id, { title: title.trim() || contactName, value: Number(value) || 0 });
    setEditing(false);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("למחוק את ההזדמנות הזו?")) deleteOpportunity(opp.id);
  }

  if (editing) {
    return (
      <form
        onSubmit={save}
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-2 text-sm space-y-1"
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-2 py-1 text-sm rounded border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          placeholder="שווי"
          className="w-full px-2 py-1 text-sm rounded border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        <div className="flex gap-2">
          <button type="submit" className="text-xs px-2 py-1 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            שמירה
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs px-2 py-1 text-neutral-400">
            ביטול
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 text-sm cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <Link href={`/contacts/${opp.contactId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {contactName}
        </Link>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs">
            ✎
          </button>
          {canDelete && (
            <button onClick={handleDelete} className="text-neutral-400 hover:text-red-500 text-xs">
              ×
            </button>
          )}
        </div>
      </div>
      {opp.value > 0 && (
        <div className="text-xs text-neutral-500 mt-1">₪{opp.value.toLocaleString("he-IL")}</div>
      )}
    </div>
  );
}

function StageColumn({
  pipelineId,
  stageId,
  name,
  winProbability,
  opportunities,
  contacts,
}: {
  pipelineId: string;
  stageId: string;
  name: string;
  winProbability: number;
  opportunities: Opportunity[];
  contacts: Contact[];
}) {
  const { renameStage, deleteStage, members, currentMemberId } = useStore();
  const canManage = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const total = opportunities.reduce((sum, o) => sum + o.value, 0);

  function saveName() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) renameStage(pipelineId, stageId, draft.trim());
  }

  async function handleDelete() {
    setError(null);
    const res = await deleteStage(pipelineId, stageId);
    if (!res.ok) setError(res.reason ?? "לא ניתן למחוק.");
  }

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-lg border ${
        isOver ? "border-neutral-400 dark:border-neutral-500" : "border-neutral-200 dark:border-neutral-800"
      } bg-neutral-50 dark:bg-neutral-900 flex flex-col`}
    >
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="font-medium text-sm bg-transparent border-b border-neutral-400 outline-none flex-1 min-w-0"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="font-medium text-sm text-start truncate hover:underline">
              {name}
            </button>
          )}
          <span className="text-xs text-neutral-500 shrink-0">{winProbability}%</span>
          {canManage && (
            <button
              onClick={handleDelete}
              className="text-neutral-300 hover:text-red-500 shrink-0 text-sm leading-none"
              title="מחיקת שלב"
            >
              ×
            </button>
          )}
        </div>
        <div className="text-xs text-neutral-500">
          {opportunities.length} · ₪{total.toLocaleString("he-IL")}
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
      <div className="p-2 flex flex-col gap-2 min-h-24">
        {opportunities.map((o) => (
          <OpportunityCard
            key={o.id}
            opp={o}
            contactName={contacts.find((c) => c.id === o.contactId)?.name ?? "—"}
          />
        ))}
      </div>
    </div>
  );
}

function AddStageColumn({ pipelineId }: { pipelineId: string }) {
  const { addStage } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addStage(pipelineId, name.trim());
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-48 shrink-0 h-fit rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 px-3 py-2 hover:border-neutral-400"
      >
        + שלב חדש
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-48 shrink-0 h-fit rounded-lg border border-neutral-200 dark:border-neutral-800 p-2 flex gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="שם השלב"
        className="flex-1 min-w-0 px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
      />
      <button type="submit" className="px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 shrink-0">
        הוספה
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2 py-1 text-sm text-neutral-400 shrink-0"
      >
        ביטול
      </button>
    </form>
  );
}

export function PipelineBoard({ pipeline }: { pipeline: Pipeline }) {
  const { opportunities, contacts, moveOpportunity } = useStore();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    moveOpportunity(String(active.id), String(over.id));
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((stage) => (
          <StageColumn
            key={stage.id}
            pipelineId={pipeline.id}
            stageId={stage.id}
            name={stage.name}
            winProbability={stage.winProbability}
            opportunities={opportunities.filter(
              (o) => o.pipelineId === pipeline.id && o.stageId === stage.id
            )}
            contacts={contacts}
          />
        ))}
        <AddStageColumn pipelineId={pipeline.id} />
      </div>
    </DndContext>
  );
}
