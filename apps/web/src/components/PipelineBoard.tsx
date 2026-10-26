"use client";

import { useState } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import type { Pipeline, Opportunity, Contact } from "@/lib/types";
import { useStore } from "@/lib/store";
import { EditLeadSheet } from "@/components/leads/EditLeadSheet";
import { needsAssignment, OwnerSelect } from "@/components/leads/OwnerSelect";
import { StatusSelect } from "@/components/leads/StatusSelect";
import { useStageMovePrompt } from "@/components/leads/StageMovePrompt";
import { colorAt } from "@/components/ui/ColorChip";

function CloseForm({ opp, onDone }: { opp: Opportunity; onDone: () => void }) {
  const { opportunities, setOpportunityStatus } = useStore();
  const [reason, setReason] = useState("");
  const knownReasons = Array.from(new Set(opportunities.map((o) => o.lostReason).filter(Boolean))) as string[];

  async function close(status: "won" | "lost" | "abandoned") {
    await setOpportunityStatus(opp.id, status, reason);
    onDone();
  }

  return (
    <div onPointerDown={(e) => e.stopPropagation()} className="mt-2 space-y-1.5 border-t border-neutral-200 dark:border-neutral-800 pt-2">
      <div className="flex gap-1">
        <button onClick={() => close("won")} className="flex-1 text-xs px-2 py-1 rounded bg-emerald-600 text-white">
          ✓ נסגר
        </button>
        <button onClick={() => close("abandoned")} className="flex-1 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700">
          בוטל
        </button>
      </div>
      <div className="flex gap-1">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          list={`lost-reasons-${opp.id}`}
          placeholder="סיבה (לא נסגר)"
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        <datalist id={`lost-reasons-${opp.id}`}>
          {knownReasons.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <button onClick={() => close("lost")} className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 dark:border-red-800">
          ✗ לא נסגר
        </button>
      </div>
      <button onClick={onDone} className="text-[11px] text-neutral-400">
        ביטול
      </button>
    </div>
  );
}

function OpportunityCard({ opp, contactName, color }: { opp: Opportunity; contactName: string; color?: string }) {
  const { deleteOpportunity, members, currentMemberId, contacts, leadStatuses } = useStore();
  const contact = contacts.find((c) => c.id === opp.contactId);
  const [closing, setClosing] = useState(false);
  const canDelete = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  const [editing, setEditing] = useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("למחוק את ההזדמנות הזו?")) deleteOpportunity(opp.id);
  }

  return (
    <div
      ref={setNodeRef}
      // A stage-coloured edge on the reading side.
      style={{ ...style, ...(color ? { borderInlineStartColor: color, borderInlineStartWidth: 3 } : {}) }}
      {...listeners}
      {...attributes}
      className={`group rounded-md border bg-white dark:bg-neutral-950 p-3 text-sm cursor-grab active:cursor-grabbing ${
        contact && needsAssignment(contact) ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20" : "border-neutral-200 dark:border-neutral-800"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-1">
        <Link href={`/contacts/${opp.contactId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {contactName}
        </Link>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setClosing((v) => !v); }}
            title="סגירת ההזדמנות"
            className="text-neutral-400 hover:text-emerald-600 text-xs"
          >
            ⚑
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} title="עריכת הליד" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs">
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
      {contact && needsAssignment(contact) && (
        <div className="mt-1.5">
          <OwnerSelect contact={contact} />
        </div>
      )}
      {contact && leadStatuses.length > 0 && (
        <div className="mt-1.5">
          <StatusSelect contact={contact} />
        </div>
      )}
      {closing && <CloseForm opp={opp} onDone={() => setClosing(false)} />}
      {editing && contact && <EditLeadSheet contact={contact} opp={opp} onClose={() => setEditing(false)} />}
    </div>
  );
}

function StageColumn({
  pipelineId,
  stageId,
  name,
  color,
  winProbability,
  opportunities,
  contacts,
}: {
  pipelineId: string;
  stageId: string;
  name: string;
  color: string;
  winProbability: number;
  opportunities: Opportunity[];
  contacts: Contact[];
}) {
  const { renameStage, deleteStage, setStageColor, members, currentMemberId } = useStore();
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
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 rounded-t-lg" style={{ borderTop: `3px solid ${color}`, backgroundColor: `${color}12` }}>
        <div className="flex items-center justify-between gap-2">
          {canManage ? (
            <input type="color" value={color} onChange={(e) => setStageColor(pipelineId, stageId, e.target.value)} className="h-4 w-4 shrink-0 cursor-pointer rounded-full" title="צבע השלב" />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          )}
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
            <button onClick={() => setEditing(true)} className="font-medium text-sm text-start truncate hover:underline flex-1" style={{ color }}>
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
            color={color}
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

// Deals shown on the board: the latest moved first, optionally filtered by a
// search over the lead's name / phone.
export function PipelineBoard({ pipeline, search = "", filter }: { pipeline: Pipeline; search?: string; filter?: (o: Opportunity) => boolean }) {
  const { opportunities: all, contacts, moveOpportunity } = useStore();
  const stagePrompt = useStageMovePrompt();
  const needle = search.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const opportunities = all
    .filter((o) => {
      if (filter && !filter(o)) return false;
      if (!needle) return true;
      const c = contactById.get(o.contactId);
      return (
        (c?.name ?? "").toLowerCase().includes(needle) ||
        o.title.toLowerCase().includes(needle) ||
        (digits.length >= 3 && (c?.phone ?? "").replace(/\D/g, "").includes(digits))
      );
    })
    .sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    stagePrompt.afterMove(String(active.id), String(over.id));
    moveOpportunity(String(active.id), String(over.id));
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((stage, i) => (
          <StageColumn
            key={stage.id}
            pipelineId={pipeline.id}
            stageId={stage.id}
            name={stage.name}
            color={colorAt(stage.color, i)}
            winProbability={stage.winProbability}
            opportunities={opportunities.filter(
              (o) => o.pipelineId === pipeline.id && o.stageId === stage.id && o.status === "open"
            )}
            contacts={contacts}
          />
        ))}
        <AddStageColumn pipelineId={pipeline.id} />
      </div>
      {stagePrompt.element}
    </DndContext>
  );
}
