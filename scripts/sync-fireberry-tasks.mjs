#!/usr/bin/env node
// Syncs Fireberry tasks into the CRM from a small export of the tasks that
// changed (new / modified / open) — read-only on the Fireberry side.
//
//   node scripts/sync-fireberry-tasks.mjs --file ~/Downloads/fireberry-tasks-2026-10-29.json --org <uuid> [--leads leads.json] [--commit]
//
// • a task not in the CRM yet is added (on its lead, or client record);
// • a task Fireberry has completed is marked done here (never re-opened here);
// • a task already in the CRM is otherwise left alone.
// Lead matching: contact external_ref "fireberry:<leadid>", else by --leads (a
// {leadId: phone} map from Fireberry) matched on phone digits.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const opt = (n) => (argv.includes(`--${n}`) ? String(argv[argv.indexOf(`--${n}`) + 1]).replace(/^~/, homedir()) : null);
const ORG = opt("org");
const COMMIT = argv.includes("--commit");
const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const exp = JSON.parse(readFileSync(opt("file"), "utf8"));
const phoneMap = opt("leads") ? JSON.parse(readFileSync(opt("leads"), "utf8")) : {};
const owners = opt("owners") ? JSON.parse(readFileSync(opt("owners"), "utf8")) : {};

const normalizePhone = (p) => {
  const d = String(p ?? "").replace(/\D/g, "");
  if (!d) return null;
  return /^0\d{8,9}$/.test(d) ? `972${d.slice(1)}` : d;
};
// Fireberry stores wall-clock Israel time as if it were UTC ("…Z").
function israelToIso(s) {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local - utc)).toISOString();
}

const lc = (s) => String(s ?? "").toLowerCase();
const ids = exp.delta.map((t) => lc(t.o));

// leads / clients by Fireberry id
const contactByRef = new Map();
const recordByRef = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const part = ids.slice(i, i + 200);
  const { data: cs } = await db.from("contacts").select("id, external_ref").eq("org_id", ORG).in("external_ref", part.map((x) => `fireberry:${x}`));
  for (const c of cs ?? []) contactByRef.set(c.external_ref.split(":").pop(), c.id);
  const { data: rs } = await db.from("records").select("id, contact_id, external_ref").eq("org_id", ORG).in("external_ref", part.map((x) => `fireberry:1:${x}`));
  for (const r of rs ?? []) recordByRef.set(r.external_ref.split(":").pop(), r);
}
// by phone, for leads that were merged into another contact
const phones = [...new Set(Object.values(phoneMap).map(normalizePhone).filter(Boolean))];
const contactByPhone = new Map();
for (let i = 0; i < phones.length; i += 200) {
  const { data } = await db.from("contacts").select("id, phone_digits").eq("org_id", ORG).in("phone_digits", phones.slice(i, i + 200));
  for (const c of data ?? []) contactByPhone.set(c.phone_digits, c.id);
}

// existing CRM tasks for these ids
const { data: existing } = await db.from("tasks").select("id, done, external_ref").eq("org_id", ORG).in("external_ref", exp.delta.map((t) => `fireberry:task:${lc(t.i)}`));
const have = new Map((existing ?? []).map((t) => [t.external_ref, t]));

const toAdd = [];
const toDone = [];
const unmatched = [];
for (const t of exp.delta) {
  const ref = `fireberry:task:${lc(t.i)}`;
  const done = t.c === 10;
  const cur = have.get(ref);
  if (cur) {
    if (done && !cur.done) toDone.push(cur.id);
    continue;
  }
  const obj = lc(t.o);
  const rec = recordByRef.get(obj);
  const contactId = contactByRef.get(obj) ?? rec?.contact_id ?? contactByPhone.get(normalizePhone(phoneMap[t.o] ?? phoneMap[obj])) ?? null;
  if (!contactId && !rec) {
    unmatched.push(t);
    continue;
  }
  // Fireberry's "…Z" is the Israel wall-clock time, so the date and time are read straight from the text.
  const wall = String(t.d ?? "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  toAdd.push({
    org_id: ORG,
    title: String(t.s ?? "משימה").trim() || "משימה",
    contact_id: contactId,
    record_id: rec?.id ?? null,
    assignee: owners[t.w] ?? null,
    due_date: wall ? wall[1] : null,
    due_time: wall && wall[2] !== "00:00" ? wall[2] : null,
    done,
    created_at: israelToIso(t.cr) ?? new Date().toISOString(),
    external_ref: ref,
  });
}
console.log(`export: ${exp.delta.length} changed tasks of ${exp.total}`);
console.log(`new: ${toAdd.length} (${toAdd.filter((t) => !t.done).length} open) · to mark done: ${toDone.length} · already in the CRM: ${have.size} · lead not found: ${unmatched.length}`);
if (unmatched.length) console.log("unmatched lead ids:", [...new Set(unmatched.map((t) => t.o))].join(","));
if (!COMMIT) {
  console.log("Dry run — add --commit to apply.");
  process.exit(0);
}
for (let i = 0; i < toAdd.length; i += 200) {
  const { error } = await db.from("tasks").upsert(toAdd.slice(i, i + 200), { onConflict: "org_id,external_ref", ignoreDuplicates: true });
  if (error) throw error;
}
for (let i = 0; i < toDone.length; i += 200) {
  const { error } = await db.from("tasks").update({ done: true }).in("id", toDone.slice(i, i + 200));
  if (error) throw error;
}
console.log("applied");
