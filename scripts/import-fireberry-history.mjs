#!/usr/bin/env node
// Brings the rest of Fireberry's history: every task (done ones too) on its
// lead or client, and the notes written on clients (lead notes came with the
// first import).
//
//   node scripts/import-fireberry-history.mjs --file ~/Downloads/fireberry-ops.json \
//     --leads ~/Downloads/fireberry-sync/לידים.csv --notes ~/Downloads/fireberry-sync/הערות.csv --org <uuid> [--commit]
//
// Re-running is safe (external_ref; rows already imported are left as they are).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const opt = (n) => String(argv[argv.indexOf(`--${n}`) + 1] ?? "").replace(/^~/, homedir());
const ORG = argv[argv.indexOf("--org") + 1];
const COMMIT = argv.includes("--commit");
const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const exp = JSON.parse(readFileSync(opt("file"), "utf8"));
const csv = (p) => Papa.parse(readFileSync(p, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;

const normalizePhone = (p) => {
  const d = String(p ?? "").replace(/\D/g, "");
  if (!d) return null;
  return /^0\d{8,9}$/.test(d) ? `972${d.slice(1)}` : d;
};
// Israel wall-clock time ("…Z" from the query API, or "2026-10-01 14:42:07.000" in CSVs).
function israelToIso(s) {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local - utc)).toISOString();
}
const stripHtml = (s) =>
  String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Fireberry lead id → contact (leads were merged by phone in the first import).
const contactByPhone = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await db.from("contacts").select("id, phone_digits").eq("org_id", ORG).not("phone_digits", "is", null).range(from, from + 999);
  for (const c of data ?? []) contactByPhone.set(c.phone_digits, c.id);
  if (!data || data.length < 1000) break;
}
const contactByLead = new Map();
for (const l of csv(opt("leads"))) {
  const c = contactByPhone.get(normalizePhone(l.pcfsystemfield104));
  if (c) contactByLead.set(String(l.customobject1007id).toUpperCase(), c);
}
// Fireberry client id → client record.
const { data: recs } = await db.from("records").select("id, contact_id, external_ref").eq("org_id", ORG).like("external_ref", "fireberry:1:%");
const recordByAccount = new Map((recs ?? []).map((r) => [r.external_ref.split(":").pop(), r]));

// ---- tasks
const tasks = [];
let unmatchedTasks = 0;
for (const t of exp.data["10"] ?? []) {
  const obj = String(t.objectid ?? "").toUpperCase();
  const rec = recordByAccount.get(obj);
  const contactId = contactByLead.get(obj) ?? rec?.contact_id ?? null;
  if (!contactId && !rec) {
    unmatchedTasks++;
    continue;
  }
  const due = israelToIso(t.scheduledend);
  tasks.push({
    org_id: ORG,
    title: String(t.subject ?? "משימה").trim() || "משימה",
    contact_id: contactId,
    record_id: rec?.id ?? null,
    assignee: t.ownername ?? null,
    due_date: due ? due.slice(0, 10) : null,
    done: t.status === "הושלם" || t.statuscode === 10,
    created_at: israelToIso(t.createdon) ?? new Date().toISOString(),
    external_ref: `fireberry:task:${String(t._id).toLowerCase()}`,
  });
}

// ---- notes on clients
const notes = [];
for (const n of csv(opt("notes"))) {
  if (n.issystem === "true" || n.issystem === "1") continue;
  const rec = recordByAccount.get(String(n.objectid).toUpperCase());
  if (!rec) continue;
  const text = stripHtml(n.notetext);
  if (!text) continue;
  notes.push({
    org_id: ORG,
    record_id: rec.id,
    contact_id: null,
    type: "note",
    text: n.ownername ? `${text}\n— ${n.ownername}` : text,
    created_at: israelToIso(n.createdon) ?? new Date().toISOString(),
    external_ref: `fireberry:note:${String(n.noteid).toLowerCase()}`,
  });
}

console.log(`tasks: ${tasks.length} (${tasks.filter((t) => t.done).length} done, ${tasks.filter((t) => t.record_id).length} on clients), ${unmatchedTasks} with no lead/client`);
console.log(`client notes: ${notes.length}`);
if (!COMMIT) {
  console.log("Dry run — add --commit to import.");
  process.exit(0);
}
for (const [table, rows] of [["tasks", tasks], ["activities", notes]]) {
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 300), { onConflict: "org_id,external_ref", ignoreDuplicates: true });
    if (error) throw error;
  }
}
console.log("imported");
