"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Stage gates: requirements for moving a deal between stages (see migration
// 20261120100000_stage_gates.sql). Enforced in the database; the client checks
// first so it can explain what is missing and let the agent fix it on the spot.

export type GateKind = "check" | "file";
export type GateDirection = "enter" | "leave";

export type StageGate = {
  id: string;
  stageId: string;
  direction: GateDirection;
  targetStageId?: string;
  kind: GateKind;
  label: string;
  position: number;
};

export type MissingGate = { gateId: string; label: string; kind: GateKind; direction: GateDirection; stageId: string };
export type GateBlock = { oppId: string; toStageId: string; missing: MissingGate[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const mapGate = (r: Row): StageGate => ({
  id: r.id,
  stageId: r.stage_id,
  direction: r.direction,
  targetStageId: r.target_stage_id ?? undefined,
  kind: r.kind,
  label: r.label,
  position: r.position ?? 0,
});

// What is still missing to move the deal to `toStageId`. Any error (e.g. the
// migration isn't applied yet) means "nothing known to be missing".
export async function missingGates(oppId: string, toStageId: string): Promise<MissingGate[]> {
  const { data, error } = await supabase.rpc("missing_stage_gates", { p_opp: oppId, p_to: toStageId });
  if (error || !Array.isArray(data)) return [];
  return data.map((m: Row) => ({ gateId: m.gate_id, label: m.label, kind: m.kind, direction: m.direction, stageId: m.stage_id }));
}

// The error the database trigger raises when a gate is violated (race / non-UI paths).
export function parseGateError(message?: string): MissingGate[] | null {
  if (!message?.startsWith("stage_gate:")) return null;
  try {
    return (JSON.parse(message.slice("stage_gate:".length)) as Row[]).map((m) => ({ gateId: m.gate_id, label: m.label, kind: m.kind, direction: m.direction, stageId: m.stage_id }));
  } catch {
    return null;
  }
}

// A tiny event bus so any move (board, table, lead card…) can open the one global dialog.
type Listener = (b: GateBlock) => void;
const listeners = new Set<Listener>();
export const onGateBlock = (fn: Listener) => (listeners.add(fn), () => void listeners.delete(fn));
export const openGateDialog = (b: GateBlock) => listeners.forEach((fn) => fn(b));

const changed = new Set<() => void>();
const notifyChanged = () => changed.forEach((fn) => fn());

export async function setGateCheck(orgId: string, contactId: string, gateId: string, done: boolean) {
  if (done) await supabase.from("lead_gate_checks").upsert({ org_id: orgId, contact_id: contactId, gate_id: gateId }, { onConflict: "contact_id,gate_id", ignoreDuplicates: true });
  else await supabase.from("lead_gate_checks").delete().eq("contact_id", contactId).eq("gate_id", gateId);
  notifyChanged();
}

export async function uploadGateFiles(orgId: string, contactId: string, gateId: string, list: File[]): Promise<string> {
  for (const file of list) {
    if (file.size > 25 * 1024 * 1024) return `"${file.name}" גדול מ-25MB`;
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
    const path = `${orgId}/${crypto.randomUUID()}${ext}`;
    const up = await supabase.storage.from("files").upload(path, file, { contentType: file.type || undefined });
    if (up.error) return up.error.message;
    const ins = await supabase.from("files").insert({ org_id: orgId, contact_id: contactId, name: file.name, path, size: file.size, mime: file.type || null, gate_id: gateId });
    if (ins.error) return ins.error.message;
  }
  notifyChanged();
  return "";
}

// All gates of the org (small table).
export function useStageGates() {
  const [gates, setGates] = useState<StageGate[]>([]);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("stage_gates").select("*").order("position").order("created_at");
    if (!error && data) setGates(data.map(mapGate));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    changed.add(load);
    return () => (clearTimeout(t), void changed.delete(load));
  }, [load]);

  async function add(orgId: string, g: Omit<StageGate, "id" | "position">) {
    const position = gates.filter((x) => x.stageId === g.stageId).length;
    const { error } = await supabase.from("stage_gates").insert({ org_id: orgId, stage_id: g.stageId, direction: g.direction, target_stage_id: g.targetStageId ?? null, kind: g.kind, label: g.label, position });
    await load();
    return error?.message ?? "";
  }
  async function remove(id: string) {
    await supabase.from("stage_gates").delete().eq("id", id);
    await load();
  }
  return { gates, add, remove, reload: load };
}

// What is done for one lead: ticked check ids + file counts per gate.
export function useLeadGateState(contactId: string) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [fileNames, setFileNames] = useState<Map<string, string[]>>(new Map());
  const load = useCallback(async () => {
    const [c, f] = await Promise.all([
      supabase.from("lead_gate_checks").select("gate_id").eq("contact_id", contactId),
      supabase.from("files").select("gate_id, name").eq("contact_id", contactId).not("gate_id", "is", null),
    ]);
    setChecked(new Set((c.data ?? []).map((r: Row) => r.gate_id)));
    const m = new Map<string, string[]>();
    for (const r of (f.data ?? []) as Row[]) m.set(r.gate_id, [...(m.get(r.gate_id) ?? []), r.name]);
    setFileNames(m);
  }, [contactId]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    changed.add(load);
    return () => (clearTimeout(t), void changed.delete(load));
  }, [load]);
  return { checked, fileNames };
}
