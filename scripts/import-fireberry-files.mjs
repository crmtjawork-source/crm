#!/usr/bin/env node
// Copies files attached in Fireberry into the CRM's private "files" storage,
// on the right lead / client / property.
//
//   node scripts/import-fireberry-files.mjs --list files.tsv --notes ~/Downloads/fireberry-sync/הערות.csv \
//     --leads ~/Downloads/fireberry-sync/לידים.csv --org <uuid> [--commit]
//
// files.tsv rows: <note id or its prefix> \t <fireberry object type> \t <created (Israel time)> \t <file url>
// The note export says which record each file sits on. Re-running is safe.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
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
const csv = (p) => Papa.parse(readFileSync(p, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const normalizePhone = (p) => {
  const d = String(p ?? "").replace(/\D/g, "");
  if (!d) return null;
  return /^0\d{8,9}$/.test(d) ? `972${d.slice(1)}` : d;
};
function israelToIso(s) {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const guess = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local - utc)).toISOString();
}
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf", gif: "image/gif", webp: "image/webp", heic: "image/heic" };

const notes = csv(opt("notes"));
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
const { data: recs } = await db.from("records").select("id, external_ref").eq("org_id", ORG).like("external_ref", "fireberry:%");
const recordByRef = new Map((recs ?? []).map((r) => [r.external_ref.toUpperCase(), r.id]));

const list = readFileSync(opt("list"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t"));
let done = 0;
for (const [prefix, type, created, url] of list) {
  const note = notes.find((n) => String(n.noteid).toUpperCase().startsWith(prefix.toUpperCase()));
  const objectId = String(note?.objectid ?? "").toUpperCase();
  const target =
    type === "1007"
      ? { contact_id: contactByLead.get(objectId) ?? null }
      : { record_id: recordByRef.get(`FIREBERRY:${type}:${objectId}`) ?? null };
  const name = decodeURIComponent(url.split("/").pop()).replace(/\s+/g, " ").trim();
  if (!target.contact_id && !target.record_id) {
    console.log(`skip  ${name} — its ${type === "1007" ? "lead" : "record"} isn't in the CRM`);
    continue;
  }
  const ref = `fireberry:file:${(note?.noteid ?? prefix).toLowerCase()}`;
  const { data: existing } = await db.from("files").select("id").eq("org_id", ORG).eq("external_ref", ref).maybeSingle();
  if (existing) {
    console.log(`have  ${name}`);
    continue;
  }
  if (!COMMIT) {
    console.log(`would ${name} → ${target.contact_id ? `lead ${target.contact_id}` : `record ${target.record_id}`}`);
    continue;
  }
  const res = await fetch(encodeURI(url));
  if (!res.ok) {
    console.log(`fail  ${name}: HTTP ${res.status}`);
    continue;
  }
  const body = Buffer.from(await res.arrayBuffer());
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const mime = MIME[ext] ?? res.headers.get("content-type") ?? "application/octet-stream";
  const path = `${ORG}/${randomUUID()}.${ext || "bin"}`;
  const up = await db.storage.from("files").upload(path, body, { contentType: mime });
  if (up.error) throw up.error;
  const { error } = await db.from("files").insert({ org_id: ORG, ...target, name, path, size: body.length, mime, uploaded_by: null, external_ref: ref, created_at: israelToIso(created) });
  if (error) throw error;
  done++;
  console.log(`ok    ${name} (${Math.round(body.length / 1024)}KB)`);
}
console.log(COMMIT ? `\n${done} files imported` : "\nDry run — add --commit to import.");
