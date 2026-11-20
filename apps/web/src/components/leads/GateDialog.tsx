"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Sheet } from "@/components/ui/Sheet";
import { missingGates, onGateBlock, setGateCheck, uploadGateFiles, type GateBlock, type MissingGate } from "@/lib/gates";

// Opens whenever a move between stages is refused because requirements are
// missing: lists them in Hebrew, lets the agent tick / upload right here, and
// completes the move by itself once nothing is missing.
export function GateDialog() {
  const [block, setBlock] = useState<GateBlock | null>(null);
  useEffect(() => onGateBlock(setBlock), []);
  if (!block) return null;
  return <GateSheet block={block} onClose={() => setBlock(null)} />;
}

function GateSheet({ block, onClose }: { block: GateBlock; onClose: () => void }) {
  const { orgId, opportunities, contacts, pipelines, moveOpportunity } = useStore();
  const [missing, setMissing] = useState<MissingGate[]>(block.missing);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const moving = useRef(false);
  const opp = opportunities.find((o) => o.id === block.oppId);
  const lead = contacts.find((c) => c.id === opp?.contactId);
  const stage = pipelines.flatMap((p) => p.stages).find((s) => s.id === block.toStageId);

  const refresh = useCallback(async () => {
    const m = await missingGates(block.oppId, block.toStageId);
    setMissing(m);
    if (!m.length && !moving.current) {
      moving.current = true;
      if (await moveOpportunity(block.oppId, block.toStageId)) onClose();
      else moving.current = false;
    }
  }, [block, moveOpportunity, onClose]);

  if (!opp || !lead) return null;

  return (
    <Sheet title={`לפני שמעבירים את ${lead.name} ל"${stage?.name ?? "השלב"}"`} onClose={onClose}>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">כדי לעבור לשלב הזה צריך להשלים:</p>
      <ul className="space-y-2">
        {missing.map((m) => (
          <li key={m.gateId} className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 px-3 py-2.5 text-sm">
            <span className="flex-1 font-medium">{m.kind === "file" ? `📎 ${m.label}` : `☐ ${m.label}`}</span>
            {m.kind === "check" ? (
              <button
                disabled={busy === m.gateId}
                onClick={async () => {
                  setBusy(m.gateId);
                  await setGateCheck(orgId, lead.id, m.gateId, true);
                  await refresh();
                  setBusy("");
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-tint text-white disabled:opacity-50"
              >
                סימון כבוצע
              </button>
            ) : (
              <label className="text-xs px-2.5 py-1 rounded-lg bg-tint text-white cursor-pointer">
                {busy === m.gateId ? "מעלה…" : "העלאת קובץ"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={busy === m.gateId}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (!files.length) return;
                    setBusy(m.gateId);
                    setError(await uploadGateFiles(orgId, lead.id, m.gateId, files));
                    await refresh();
                    setBusy("");
                  }}
                />
              </label>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <p className="text-xs text-neutral-400 mt-3">אחרי שהכול מושלם, הליד עובר לשלב אוטומטית.</p>
    </Sheet>
  );
}
