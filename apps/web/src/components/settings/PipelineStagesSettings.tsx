"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { colorAt } from "@/components/ui/ColorChip";
import type { Pipeline, Stage } from "@/lib/types";

const input = "px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";
const small = "text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-25 px-1.5 py-0.5";

// Everything about the sales pipelines from inside the app: add / rename /
// reorder / recolour / delete stages, set each stage's chance of winning, and
// tie a stage to a table (the lead then also appears there).
export function PipelineStagesSettings({ isAdmin }: { isAdmin: boolean }) {
  const { pipelines, addPipeline } = useStore();
  const [name, setName] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addPipeline(name.trim());
    setName("");
  }

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">שלבי עסקה</h2>
      <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
        השלבים של הפייפליין — כל שלב שמוסיפים כאן מופיע בקנבן, בטבלה ובבחירת השלב בליד. &quot;הסיכוי&quot; הוא אחוז הסגירה שמוצג על השלב. שלב אפשר לקשור
        לטבלה: כשליד נכנס אליו, נוצרת עבורו גם רשומה שם (למשל שלב &quot;נסגרה עסקה&quot; ← לקוחות), והוא ממשיך להופיע בפייפליין.
      </p>
      {pipelines.map((p) => (
        <PipelineBlock key={p.id} pipeline={p} isAdmin={isAdmin} />
      ))}
      <LostReasonsEditor isAdmin={isAdmin} />
      {isAdmin && (
        <form onSubmit={create} className="flex gap-2 mt-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="פייפליין חדש (למשל: השכרות)" className={`${input} flex-1`} />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
      )}
    </section>
  );
}

function PipelineBlock({ pipeline, isAdmin }: { pipeline: Pipeline; isAdmin: boolean }) {
  const { addStage, renamePipeline, deletePipeline, opportunities } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const counts = new Map<string, number>();
  for (const o of opportunities) if (o.pipelineId === pipeline.id && o.status === "open") counts.set(o.stageId, (counts.get(o.stageId) ?? 0) + 1);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addStage(pipeline.id, name.trim());
    setName("");
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-sm">{pipeline.name}</h3>
        {isAdmin && (
          <span className="ms-auto flex gap-3 text-xs text-neutral-400">
            <button
              onClick={() => {
                const n = window.prompt("שם הפייפליין", pipeline.name)?.trim();
                if (n) void renamePipeline(pipeline.id, n);
              }}
              className="hover:underline"
            >
              שינוי שם
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(`למחוק את הפייפליין "${pipeline.name}" ואת השלבים שלו?`)) return;
                const res = await deletePipeline(pipeline.id);
                setError(res.ok ? "" : res.reason ?? "המחיקה נכשלה");
              }}
              className="hover:text-red-500 hover:underline"
            >
              מחיקה
            </button>
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      <ul className="space-y-1.5 mb-3">
        {pipeline.stages.map((st, i) => (
          <StageRow key={st.id} pipeline={pipeline} stage={st} index={i} count={counts.get(st.id) ?? 0} isAdmin={isAdmin} />
        ))}
      </ul>
      {isAdmin && (
        <form onSubmit={add} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שלב חדש" className={`${input} flex-1`} />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            + שלב
          </button>
        </form>
      )}
    </div>
  );
}

function StageRow({ pipeline, stage, index, count, isAdmin }: { pipeline: Pipeline; stage: Stage; index: number; count: number; isAdmin: boolean }) {
  const { updateStage, moveStage, deleteStage, objectTypes } = useStore();
  const [error, setError] = useState("");
  const color = colorAt(stage.color, index);
  const linked = objectTypes.find((t) => t.id === stage.linkObjectTypeId);

  return (
    <li className="rounded-md bg-neutral-50 dark:bg-neutral-900 px-2 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input type="color" value={color} disabled={!isAdmin} onChange={(e) => updateStage(pipeline.id, stage.id, { color: e.target.value })} className="h-5 w-5 shrink-0 cursor-pointer rounded-full" title="צבע השלב" />
        <input
          defaultValue={stage.name}
          disabled={!isAdmin}
          aria-label="שם השלב"
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== stage.name && updateStage(pipeline.id, stage.id, { name: e.target.value.trim() })}
          className={`${input} flex-1 min-w-32 font-medium`}
        />
        <label className="flex items-center gap-1 text-xs text-neutral-500" title="סיכוי הסגירה בשלב הזה">
          סיכוי
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={stage.winProbability}
            disabled={!isAdmin}
            onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== stage.winProbability && updateStage(pipeline.id, stage.id, { winProbability: Number(e.target.value) })}
            className={`${input} w-16`}
          />
          %
        </label>
        {isAdmin && (
          <span className="flex items-center">
            <button className={small} disabled={index === 0} onClick={() => moveStage(pipeline.id, stage.id, -1)} aria-label="הזזה למעלה">
              ↑
            </button>
            <button className={small} disabled={index === pipeline.stages.length - 1} onClick={() => moveStage(pipeline.id, stage.id, 1)} aria-label="הזזה למטה">
              ↓
            </button>
            <button
              className={`${small} hover:!text-red-500`}
              aria-label="מחיקת שלב"
              onClick={async () => {
                if (!window.confirm(`למחוק את השלב "${stage.name}"?`)) return;
                const res = await deleteStage(pipeline.id, stage.id);
                setError(res.ok ? "" : res.reason ?? "המחיקה נכשלה");
              }}
            >
              ×
            </button>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-neutral-500 flex-wrap">
        <span>{count} עסקאות פתוחות</span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={Boolean(stage.asksLostReason)} disabled={!isAdmin} onChange={(e) => updateStage(pipeline.id, stage.id, { asksLostReason: e.target.checked })} />
          לבקש סיבה כשהליד נכנס לשלב
        </label>
        {objectTypes.length > 0 && (
          <label className="flex items-center gap-1 ms-auto">
            כשליד נכנס לשלב — ליצור גם רשומה ב:
            <select
              value={stage.linkObjectTypeId ?? ""}
              disabled={!isAdmin}
              onChange={(e) => updateStage(pipeline.id, stage.id, { linkObjectTypeId: e.target.value || null })}
              className={`${input} py-1`}
            >
              <option value="">— לא ליצור —</option>
              {objectTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {linked && <p className="text-[11px] text-neutral-400 mt-1">ליד שנכנס לשלב הזה מקבל {linked.singular} ב{linked.name} (פעם אחת לכל ליד), ונשאר בפייפליין. עסקאות שכבר בשלב לא נוספות רטרואקטיבית.</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </li>
  );
}

// The answers offered when a deal isn't closed (stages marked "ask for a reason").
function LostReasonsEditor({ isAdmin }: { isAdmin: boolean }) {
  const { lostReasons, setLostReasons } = useStore();
  const [name, setName] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || lostReasons.includes(n)) return;
    await setLostReasons([...lostReasons, n]);
    setName("");
  }
  async function move(i: number, d: number) {
    const next = [...lostReasons];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    await setLostReasons(next);
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 mb-4">
      <h3 className="font-semibold text-sm mb-1">סיבות לאי-סגירת עסקה</h3>
      <p className="text-xs text-neutral-500 mb-2 leading-relaxed">הרשימה שנפתחת כשליד עובר לשלב שמסומן &quot;לבקש סיבה&quot; (למשל &quot;לא נסגרה עסקה&quot;). הסיבה נשמרת על העסקה ובציר הזמן של הליד.</p>
      <ul className="space-y-1 mb-2">
        {lostReasons.map((r, i) => (
          <li key={r} className="flex items-center gap-2 rounded-md bg-neutral-50 dark:bg-neutral-900 px-2 py-1.5 text-sm">
            <span className="flex-1">{r}</span>
            {isAdmin && (
              <span className="flex items-center text-neutral-400">
                <button className="hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-25 px-1.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label="הזזה למעלה">
                  ↑
                </button>
                <button className="hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-25 px-1.5" disabled={i === lostReasons.length - 1} onClick={() => move(i, 1)} aria-label="הזזה למטה">
                  ↓
                </button>
                <button className="hover:text-red-500 px-1.5" onClick={() => setLostReasons(lostReasons.filter((x) => x !== r))} aria-label="מחיקה">
                  ×
                </button>
              </span>
            )}
          </li>
        ))}
        {lostReasons.length === 0 && <p className="text-sm text-neutral-400">אין סיבות — מוסיפים למטה.</p>}
      </ul>
      {isAdmin && (
        <form onSubmit={add} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="סיבה חדשה (למשל: המחיר גבוה מדי)" className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
      )}
    </div>
  );
}
