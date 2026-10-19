#!/usr/bin/env node
// Imports Fireberry's phone-call log (Voicenter) onto leads' timelines:
// outbound calls match the lead by the dialled number, inbound by the caller.
//
//   node scripts/import-fireberry-calls.mjs --file ~/Downloads/fireberry-ops.json --org <uuid> [--commit]
//
// Re-running is safe (external_ref). Without --commit: dry run.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const opt = (n) => argv[argv.indexOf(`--${n}`) + 1];
const FILE = String(opt("file") ?? "").replace(/^~/, homedir());
const ORG = opt("org");
const COMMIT = argv.includes("--commit");
if (!FILE || !ORG) {
  console.error("usage: node scripts/import-fireberry-calls.mjs --file <json> --org <uuid> [--commit]");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const exp = JSON.parse(readFileSync(FILE, "utf8"));

const normalizePhone = (p) => {
  const d = String(p ?? "").replace(/\D/g, "");
  if (!d) return null;
  return /^0\d{8,9}$/.test(d) ? `972${d.slice(1)}` : d;
};
function israelToIso(s) {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local - utc)).toISOString();
}
const STATUS = { "נענתה": "answered", "לא נענתה": "no_answer", "תפוס": "busy", "בוטלה": "cancelled", "מספר לא מחובר": "failed" };

// Contacts by phone (paged — more than 1,000 leads).
const contactByPhone = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await db.from("contacts").select("id, phone_digits").eq("org_id", ORG).not("phone_digits", "is", null).range(from, from + 999);
  for (const c of data ?? []) contactByPhone.set(c.phone_digits, c.id);
  if (!data || data.length < 1000) break;
}
const { data: recs } = await db.from("records").select("id, external_ref").eq("org_id", ORG).like("external_ref", "fireberry:1:%");
const recordByFb = new Map((recs ?? []).map((r) => [r.external_ref.split(":").pop(), r.id]));
const team = [
  ...((await db.from("memberships").select("users(email, full_name)").eq("org_id", ORG)).data ?? []).map((m) => ({ email: m.users?.email, name: m.users?.full_name })),
  ...((await db.from("invitations").select("email, name").eq("org_id", ORG)).data ?? []),
];
const agentEmail = (name) => team.find((t) => t.name && name && (t.name === name || t.name.split(/\s+/)[0] === name.split(/\s+/)[0]))?.email ?? null;

const rows = [];
let matched = 0;
for (const c of exp.data["100"] ?? []) {
  const outbound = c.typename !== "נכנסת";
  const other = normalizePhone(outbound ? c.targetid : c.callerid);
  const contactId = other ? contactByPhone.get(other) ?? null : null;
  const recordId = c.accountid ? recordByFb.get(String(c.accountid).toUpperCase()) ?? null : null;
  if (contactId || recordId) matched++;
  let transcript = null;
  try {
    const t = c.voicentertranscript ? JSON.parse(c.voicentertranscript) : null;
    if (Array.isArray(t)) transcript = t.map((s) => ({ speaker: s.speaker, text: String(s.text ?? "").replace(/<unk>/g, "״"), start: s.startTime ?? null }));
  } catch {}
  rows.push({
    org_id: ORG,
    contact_id: contactId,
    record_id: recordId,
    direction: outbound ? "outbound" : "inbound",
    status: STATUS[c.statusname] ?? c.statusname ?? null,
    from_number: c.callerid || null,
    to_number: c.targetid || null,
    agent_name: c.owneridname && c.owneridname !== "מנהל מערכת" ? c.owneridname : null,
    agent_email: agentEmail(c.owneridname),
    duration_seconds: c.duration != null ? Math.round(Number(c.duration) * 60) : null,
    wait_seconds: c.dialtime ?? null,
    recording_url: c.recordurl || null,
    transcript,
    summary: c.voicenteranalytics || null,
    started_at: israelToIso(c.createdon) ?? new Date().toISOString(),
    provider: "voicenter",
    external_ref: `fireberry:call:${String(c._id).toUpperCase()}`,
  });
}
console.log(`${rows.length} calls · ${matched} matched to a lead/client · ${rows.filter((r) => r.summary).length} with summary · ${rows.filter((r) => r.transcript).length} with transcript`);
if (!COMMIT) {
  console.log("Dry run — add --commit to import.");
  process.exit(0);
}
// Calls that match nobody are kept too (searchable later when the lead appears).
for (let i = 0; i < rows.length; i += 300) {
  const { error } = await db.from("calls").upsert(rows.slice(i, i + 300), { onConflict: "org_id,external_ref" });
  if (error) throw error;
}
console.log("imported");
