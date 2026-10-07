#!/usr/bin/env node
// Imports a Fireberry "full system export" (one CSV per object) into an org.
// Leads already in the CRM (same phone) get their Fireberry history attached
// instead of a duplicate contact.
//
//   node scripts/import-fireberry.mjs --dir ~/Downloads --org <org-uuid> [--commit]
//
// Without --commit it is a dry run: it reads, maps and reports, and writes
// nothing. Re-running is safe: every row carries external_ref
// ('fireberry:...') and only rows not imported before are inserted —
// anything already in the CRM (and possibly edited there) is left alone.
//
// Scope (sales only): leads (merged by phone), one opportunity per lead with
// its outcome, manual notes, past meetings as timeline entries, future
// meetings as appointments, open tasks, and the team as invitations.
// Not imported: Fireberry's automatic notes (webhook-call logs), finished
// tasks, phone-call logs, demo data, and the operations objects
// (clients/properties — phase 2).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

// ------------------------------------------------------------------ args/env
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]);
    return acc;
  }, [])
);
const DIR = String(args.dir ?? "").replace(/^~/, homedir());
const ORG = args.org;
const COMMIT = args.commit === true;
if (!DIR || !ORG) {
  console.error("usage: node scripts/import-fireberry.mjs --dir <export dir> --org <org uuid> [--commit]");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ------------------------------------------------------------------ helpers
const load = (name) =>
  Papa.parse(readFileSync(join(DIR, `${name}.csv`), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const clean = (v) => (v ?? "").replace(/[‎‏]/g, "").trim();
const unknown = (v) => !v || v === "לא ידוע";

// Same rules as SQL normalize_phone() / apps/web/src/lib/server/phone.ts.
function normalizePhone(phone) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return /^0\d{8,9}$/.test(digits) ? `972${digits.slice(1)}` : digits;
}

// Fireberry exports wall-clock Israel time ("2026-10-01 14:42:07.000").
const TZ = "Asia/Jerusalem";
function offsetMinutes(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((x) => [x.type, Number(x.value)])
  );
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / 60_000;
}
function israelToIso(value) {
  const m = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0"] = m.map((x, i) => (i ? Number(x) : x));
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const first = new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
  return new Date(guess.getTime() - offsetMinutes(first) * 60_000).toISOString();
}
const israelLabel = (iso) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

function htmlToText(v) {
  return clean(v)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function insertNew(table, rows, size = 500) {
  // ignoreDuplicates: a re-run never overwrites rows that already exist.
  let inserted = 0;
  for (let i = 0; i < rows.length; i += size) {
    const { data, error } = await db
      .from(table)
      .upsert(rows.slice(i, i + size), { onConflict: "org_id,external_ref", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function idsByRef(table, refs) {
  const map = new Map();
  for (let i = 0; i < refs.length; i += 300) {
    const { data, error } = await db.from(table).select("id, external_ref").eq("org_id", ORG).in("external_ref", refs.slice(i, i + 300));
    if (error) throw new Error(`${table} lookup: ${error.message}`);
    for (const r of data ?? []) map.set(r.external_ref, r.id);
  }
  return map;
}

// ------------------------------------------------------------------ mapping
const STAGES = [
  ["ליד חדש", 10],
  ["ללא מענה", 10],
  ["נשלחו פרטים", 20],
  ["פולו-אפ (לפני פגישה)", 25],
  ["רוצה פגישה", 35],
  ["נקבעה פגישה", 50],
  ["לא הגיע לפגישה", 30],
  ["בתהליך אחרי פגישה", 60],
  ["סיור", 75],
  ["לחזור בעוד חצי שנה", 15],
];
const STAGE_MAP = {
  "ליד חדש": ["ליד חדש", "open"],
  "ליד ללא מענה": ["ללא מענה", "open"],
  "נשלחו פרטים": ["נשלחו פרטים", "open"],
  "פולו-אפ": ["פולו-אפ (לפני פגישה)", "open"],
  "רוצה פגישה": ["רוצה פגישה", "open"],
  "נקבעה פגישה": ["נקבעה פגישה", "open"],
  "תיאם פגישה ולא הגיע": ["לא הגיע לפגישה", "open"],
  "בתהליך אחרי פגישה": ["בתהליך אחרי פגישה", "open"],
  "היה בסיור": ["סיור", "open"],
  "היה בפגישה ולא סגר": ["לחזור בעוד חצי שנה", "open"],
  "נסגרה עסקה": ["בתהליך אחרי פגישה", "won"],
  "לא נסגרה עסקה": ["ליד חדש", "lost"],
  "בוטלה עסקה": ["ליד חדש", "abandoned"],
};
const ROLE_MAP = { "סוכן מכירות": "agent", "תפעול": "agent", "מנהל מערכת": "admin" };
const SYSTEM_ACCOUNT = "מנהל מערכת";

// Campaign attribution. Fireberry keeps the ad platform's campaign name in
// pcfsystemfield120; this business's naming convention puts the agency
// first ("AIR | Leads | ABO | …"). Edit AGENCIES for another business.
const AGENCIES = [
  [/^air\b/i, "AIR"],
  [/get\s*scale/i, "Getscale"],
  [/nexsus/i, "NEXSUS"],
  [/^pma\b/i, "PMA"],
];
const SOURCE_PLATFORMS = {
  "קמפיין ממומן - פייסבוק": "meta",
  "אורגני - אינסטגרם": "organic",
  "שיתופי פעולה": "referral",
  "המלצה מלקוח": "referral",
  "טיקטוק": "tiktok",
  "קהילות וקבוצות ווצאפ": "whatsapp",
};
const stripMarks = (v) => clean(v).replace(/[\u200e\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim();

function campaignOf(lead) {
  const raw = stripMarks(lead.pcfsystemfield120);
  if (raw) {
    const platform = /ליד מהאתר|מהאתר/.test(raw) ? "website" : "meta";
    const agency = AGENCIES.find(([re]) => re.test(raw.split("|")[0].trim()))?.[1] ?? null;
    return { name: raw, platform, agency };
  }
  const src = clean(lead.pcfsystemfield112name);
  if (src && !unknown(src)) return { name: src, platform: SOURCE_PLATFORMS[src] ?? "other", agency: null };
  if (clean(lead.pcfsystemfield134) === "facebook") return { name: "פייסבוק (ללא שם קמפיין)", platform: "meta", agency: null };
  return null;
}

function sourceOf(lead) {
  if (!unknown(clean(lead.pcfsystemfield112name))) return clean(lead.pcfsystemfield112name);
  const campaign = clean(clean(lead.pcfsystemfield120).split("|")[0]);
  if (/get\s*scale/i.test(campaign)) return "Getscale";
  if (campaign) return campaign;
  if (clean(lead.pcfsystemfield134) === "facebook") return "פרסומת פייסבוק";
  return "לא ידוע";
}

function fieldsOf(lead) {
  const f = {};
  const set = (key, value) => {
    const v = clean(value).replace(/_/g, " ");
    if (v && !unknown(v)) f[key] = v;
  };
  set("תקציב", unknown(clean(lead.pcfsystemfield113name)) ? lead.pcfsystemfield122 : lead.pcfsystemfield113name);
  set("אזור מבוקש", lead.pcfsystemfield114name);
  set("שוק", lead.pcfsystemfield115name);
  set("סוג שירות", lead.pcfsystemfield116name);
  set("תשובות מהטופס", lead.pcfsystemfield117);
  set("פרטי קמפיין", lead.pcfsystemfield120);
  set("קהל", lead.pcfsystemfield130);
  set("מודעה", lead.pcfsystemfield131);
  set("שירות צבאי", lead.pcfsystemfield121);
  set("גיל", lead.pcfsystemfield127);
  set("עיר", lead.pcfsystemfield128);
  set("אימייל נוסף", lead.pcfsystemfield124);
  set("מתי לחזור", lead.pcfsystemfield118name || lead.pcfsystemfield109name);
  const callback = israelToIso(lead.pcfsystemfield119);
  if (callback) f["מועד חזרה"] = israelLabel(callback);
  set("סטטוס טיפול (Fireberry)", lead.pcfsystemfield102name);
  return f;
}

// ------------------------------------------------------------------ main
const users = load("משתמשים");
const leads = load("לידים");
const notes = load("הערות");
const meetings = load("פגישות");
const tasks = load("משימות");

const userById = new Map(users.map((u) => [clean(u.crmuserid).toLowerCase(), u]));
const ownerEmailOf = (id) => {
  const u = userById.get(clean(id).toLowerCase());
  return u && clean(u.fullname) !== SYSTEM_ACCOUNT ? clean(u.username).toLowerCase() : null;
};
const ownerNameOf = (id) => clean(userById.get(clean(id).toLowerCase())?.fullname) || "";

// 1) Merge leads that share a phone number.
const groups = new Map();
for (const lead of leads) {
  const key = normalizePhone(lead.pcfsystemfield104) ?? `id:${lead.customobject1007id}`;
  groups.set(key, [...(groups.get(key) ?? []), lead]);
}
const now = Date.now();
const contactRows = [];
const oppPlan = []; // [contactRef, row-without-contact_id]
const contactRefByLeadId = new Map();
const campaignPlan = []; // { ref, campaign, attribution }

for (const group of groups.values()) {
  group.sort((a, b) => clean(b.modifiedon).localeCompare(clean(a.modifiedon)));
  const primary = group[0];
  const ref = `fireberry:${clean(primary.customobject1007id).toLowerCase()}`;
  group.forEach((l) => contactRefByLeadId.set(clean(l.customobject1007id).toLowerCase(), ref));

  const fields = {};
  for (const lead of [...group].reverse()) Object.assign(fields, fieldsOf(lead)); // newest wins
  const createdIso = group.map((l) => israelToIso(l.createdon)).filter(Boolean).sort()[0];
  if (group.length > 1) fields["אוחד מ-Fireberry"] = `${group.length} רשומות עם אותו טלפון`;

  contactRows.push({
    org_id: ORG,
    external_ref: ref,
    name: group.map((l) => clean(l.name)).find(Boolean) || clean(primary.pcfsystemfield104) || "ליד ללא שם",
    phone: clean(primary.pcfsystemfield104) || null,
    email: group.map((l) => clean(l.pcfsystemfield111)).find(Boolean) || null,
    source: sourceOf(group.find((l) => sourceOf(l) !== "לא ידוע") ?? primary),
    tags: ["יובא מ-Fireberry"],
    fields,
    owner_email: ownerEmailOf(primary.ownerid),
    created_at: createdIso ?? new Date().toISOString(),
  });

  // First touch: the earliest record that names a campaign.
  const firstTouch = [...group].sort((a, b) => clean(a.createdon).localeCompare(clean(b.createdon))).find((l) => campaignOf(l));
  if (firstTouch) {
    const attribution = {};
    if (stripMarks(firstTouch.pcfsystemfield131)) attribution.ad_name = stripMarks(firstTouch.pcfsystemfield131);
    if (clean(firstTouch.pcfsystemfield132)) attribution.ad_id = clean(firstTouch.pcfsystemfield132);
    campaignPlan.push({ ref, campaign: campaignOf(firstTouch), attribution });
  }

  // The deal that matters is an open one if any record is still open.
  const isOpen = (l) => STAGE_MAP[clean(l.pcfsystemfield101name)]?.[1] === "open";
  const deal = group.find(isOpen) ?? primary;
  let [stageName, status] = STAGE_MAP[clean(deal.pcfsystemfield101name)] ?? [];
  let lostReason = clean(deal.pcfsystemfield103name) || null;
  if (!stageName) {
    const recent = now - new Date(israelToIso(deal.createdon) ?? 0).getTime() < 60 * 24 * 3600_000;
    [stageName, status] = recent ? ["ליד חדש", "open"] : ["ליד חדש", "lost"];
    if (!recent) lostReason = "ללא סטטוס ב-Fireberry";
  }
  oppPlan.push([
    ref,
    {
      org_id: ORG,
      external_ref: `fireberry:opp:${clean(deal.customobject1007id).toLowerCase()}`,
      title: contactRows.at(-1).name,
      value: 0,
      stageName,
      status,
      lost_reason: status === "lost" ? lostReason : null,
      closed_at: status === "open" ? null : israelToIso(deal.modifiedon),
      created_at: israelToIso(deal.createdon) ?? new Date().toISOString(),
    },
  ]);
}

// 2) Manual notes, meetings, open tasks — attached to the merged contact.
const manualNotes = notes.filter((n) => clean(n.issystem) === "0" && contactRefByLeadId.has(clean(n.objectid).toLowerCase()));
const noteRows = manualNotes
  .map((n) => ({
    contactRef: contactRefByLeadId.get(clean(n.objectid).toLowerCase()),
    row: {
      org_id: ORG,
      external_ref: `fireberry:note:${clean(n.noteid).toLowerCase()}`,
      type: "note",
      text: `✍️ ${clean(n.ownername)}: ${htmlToText(n.notetext)}`,
      created_at: israelToIso(n.createdon) ?? new Date().toISOString(),
    },
  }))
  .filter((n) => n.row.text.length > 4);

const meetingKind = (m) => (/zoom|זום|meet/i.test(clean(m.pcfsystemfield100name) + clean(m.pcfsystemfield101)) ? "פגישת זום" : "פגישה במשרד");
// Every meeting that wasn't cancelled goes on the calendar (campaign reports
// count booked meetings); past ones are also written into the timeline.
const pastMeetingRows = [];
const calendarMeetings = [];
for (const m of meetings) {
  const contactRef = contactRefByLeadId.get(clean(m.objectid).toLowerCase());
  if (!contactRef) continue;
  const start = israelToIso(m.scheduledstart);
  if (!start) continue;
  if (clean(m.status) !== "בוטלה") calendarMeetings.push({ contactRef, m, start, end: israelToIso(m.scheduledend) ?? start });
  if (new Date(start).getTime() <= now) {
    pastMeetingRows.push({
      contactRef,
      row: {
        org_id: ORG,
        external_ref: `fireberry:meeting:${clean(m.activityid).toLowerCase()}`,
        type: "note",
        text: `📅 ${meetingKind(m)} ב-${israelLabel(start)} · ${clean(m.status)} · ${clean(m.ownername)}`,
        created_at: start,
      },
    });
  }
}

const openTasks = tasks
  .filter((t) => clean(t.status) === "פתוח")
  .map((t) => ({
    contactRef: contactRefByLeadId.get(clean(t.objectid).toLowerCase()) ?? null,
    row: {
      org_id: ORG,
      external_ref: `fireberry:task:${clean(t.taskid).toLowerCase()}`,
      title: clean(t.subject) || "משימה",
      assignee: ownerNameOf(t.ownerid) || null,
      due_date: israelToIso(t.scheduledend)?.slice(0, 10) ?? null,
      done: false,
      created_at: israelToIso(t.createdon) ?? new Date().toISOString(),
    },
  }));

const team = users
  .filter((u) => clean(u.fullname) !== SYSTEM_ACCOUNT && clean(u.username).includes("@"))
  .map((u) => ({ name: clean(u.fullname), email: clean(u.username).toLowerCase(), role: ROLE_MAP[clean(u.rolename)] ?? "agent", fireberryRole: clean(u.rolename) }));

// ------------------------------------------------------------------ report
const count = (arr, key) => arr.reduce((a, x) => ((a[key(x)] = (a[key(x)] || 0) + 1), a), {});
console.log(`\n${COMMIT ? "IMPORT" : "DRY RUN"} → org ${ORG}`);
console.log(`leads in export: ${leads.length} → contacts after merging by phone: ${contactRows.length}`);
console.log("opportunities by outcome:", count(oppPlan, ([, o]) => o.status));
console.log("open opportunities by stage:", count(oppPlan.filter(([, o]) => o.status === "open"), ([, o]) => o.stageName));
console.log("top sources:", Object.entries(count(contactRows, (c) => c.source)).sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log("owners:", count(contactRows, (c) => c.owner_email ?? "(ללא בעלים)"));
console.log(`manual notes: ${noteRows.length} · past meetings → timeline: ${pastMeetingRows.length} · meetings → calendar: ${calendarMeetings.length} · open tasks: ${openTasks.length}`);
console.log("team invitations:", team.map((t) => `${t.name} <${t.email}> ${t.fireberryRole}→${t.role}`));
if (!COMMIT) {
  console.log("\nNothing written. Re-run with --commit to import.");
  process.exit(0);
}

// ------------------------------------------------------------------ write
const { data: ownerMembership } = await db.from("memberships").select("user_id").eq("org_id", ORG).eq("role", "owner").limit(1).single();
const [{ data: members }, { data: invites }] = await Promise.all([
  db.from("memberships").select("users(email)").eq("org_id", ORG),
  db.from("invitations").select("email").eq("org_id", ORG),
]);
const known = new Set([...(members ?? []).map((m) => m.users?.email?.toLowerCase()), ...(invites ?? []).map((i) => i.email.toLowerCase())]);
const newInvites = team.filter((t) => !known.has(t.email));
if (newInvites.length) {
  const { error } = await db
    .from("invitations")
    .insert(newInvites.map((t) => ({ org_id: ORG, email: t.email, name: t.name, role: t.role, invited_by: ownerMembership.user_id })));
  if (error) throw error;
}
console.log(`invitations created: ${newInvites.length}`);

// Pipeline "מכירות" with the agreed stages.
let { data: pipeline } = await db.from("pipelines").select("id").eq("org_id", ORG).eq("name", "מכירות").maybeSingle();
if (!pipeline) {
  ({ data: pipeline } = await db.from("pipelines").insert({ org_id: ORG, name: "מכירות" }).select("id").single());
}
const { data: existingStages } = await db.from("stages").select("id, name").eq("pipeline_id", pipeline.id);
const stageId = new Map((existingStages ?? []).map((s) => [s.name, s.id]));
const missing = STAGES.map(([name, win], position) => ({ pipeline_id: pipeline.id, name, win_probability: win, position })).filter((s) => !stageId.has(s.name));
if (missing.length) {
  const { data } = await db.from("stages").insert(missing).select("id, name");
  for (const s of data ?? []) stageId.set(s.name, s.id);
}

// Leads that already reached the CRM another way (Meta lead form, manual
// entry) are matched by phone: their Fireberry history attaches to that
// contact instead of creating a duplicate.
const byPhone = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("contacts").select("id, phone_digits, external_ref, owner_email").eq("org_id", ORG).not("phone_digits", "is", null).range(from, from + 999);
  if (error) throw new Error(`contacts by phone: ${error.message}`);
  for (const c of data) if (!byPhone.has(c.phone_digits)) byPhone.set(c.phone_digits, c);
  if (data.length < 1000) break;
}
const matched = new Map(); // fireberry ref -> existing contact
for (const row of contactRows) {
  const existing = byPhone.get(normalizePhone(row.phone));
  if (existing && existing.external_ref !== row.external_ref) matched.set(row.external_ref, existing);
}
for (const [ref, existing] of matched) {
  if (existing.owner_email) continue;
  const owner = contactRows.find((c) => c.external_ref === ref)?.owner_email;
  if (owner) await db.from("contacts").update({ owner_email: owner }).eq("id", existing.id);
}
console.log(`matched to existing contacts by phone: ${matched.size}`);
console.log(`contacts inserted: ${await insertNew("contacts", contactRows.filter((c) => !matched.has(c.external_ref)))}`);
const contactId = await idsByRef("contacts", contactRows.map((c) => c.external_ref));
for (const [ref, existing] of matched) contactId.set(ref, existing.id);

const oppRows = oppPlan
  .filter(([ref]) => contactId.has(ref))
  .map(([ref, { stageName, ...o }]) => ({ ...o, contact_id: contactId.get(ref), pipeline_id: pipeline.id, stage_id: stageId.get(stageName) }));
console.log(`opportunities inserted: ${await insertNew("opportunities", oppRows)}`);

const withContact = (items) => items.filter((x) => contactId.has(x.contactRef)).map((x) => ({ ...x.row, contact_id: contactId.get(x.contactRef) }));
console.log(`timeline entries inserted: ${await insertNew("activities", withContact([...noteRows, ...pastMeetingRows]), 1000)}`);

// Future meetings → appointments (types created on demand, 60 min default).
const { data: types } = await db.from("appointment_types").select("id, name").eq("org_id", ORG);
const typeId = new Map((types ?? []).map((t) => [t.name, t.id]));
for (const kind of new Set(calendarMeetings.map((f) => meetingKind(f.m)))) {
  if (!typeId.has(kind)) {
    const { data } = await db.from("appointment_types").insert({ org_id: ORG, name: kind, duration_minutes: 60 }).select("id").single();
    typeId.set(kind, data.id);
  }
}
const appointmentRows = calendarMeetings
  .filter((f) => contactId.has(f.contactRef))
  .map((f) => ({
    org_id: ORG,
    external_ref: `fireberry:meeting:${clean(f.m.activityid).toLowerCase()}`,
    contact_id: contactId.get(f.contactRef),
    type_id: typeId.get(meetingKind(f.m)),
    title: `${meetingKind(f.m)} — ${contactRows.find((c) => c.external_ref === f.contactRef)?.name ?? ""}`,
    start_at: f.start,
    end_at: f.end,
    notes: [clean(f.m.pcfsystemfield100name), clean(f.m.pcfsystemfield104), `נקבעה ע"י ${clean(f.m.ownername)}`].filter(Boolean).join(" · "),
  }));
console.log(`appointments inserted: ${await insertNew("appointments", appointmentRows)}`);

const taskRows = openTasks.map((t) => ({ ...t.row, contact_id: t.contactRef ? contactId.get(t.contactRef) ?? null : null }));
console.log(`tasks inserted: ${await insertNew("tasks", taskRows)}`);

// Campaign attribution — only fills leads that don't have a campaign yet, so
// a campaign set in the CRM is never overwritten.
const campaignIds = new Map();
const byCampaign = new Map();
for (const { ref, campaign } of campaignPlan) {
  const key = `${campaign.platform}|${campaign.name.toLowerCase()}`;
  if (!campaignIds.has(key)) {
    const { data, error } = await db.rpc("resolve_campaign", { p_org: ORG, p_platform: campaign.platform, p_name: campaign.name, p_external_id: null, p_agency: campaign.agency });
    if (error) throw new Error(`resolve_campaign: ${error.message}`);
    campaignIds.set(key, data);
  }
  const id = contactId.get(ref);
  if (id) byCampaign.set(campaignIds.get(key), [...(byCampaign.get(campaignIds.get(key)) ?? []), id]);
}
let attributed = 0;
for (const [campaignId, ids] of byCampaign) {
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("contacts").update({ campaign_id: campaignId }).in("id", ids.slice(i, i + 200)).is("campaign_id", null).select("id");
    if (error) throw new Error(`campaign backfill: ${error.message}`);
    attributed += data.length;
  }
}
for (const { ref, attribution } of campaignPlan) {
  if (!Object.keys(attribution).length || !contactId.get(ref)) continue;
  await db.from("contacts").update({ attribution }).eq("id", contactId.get(ref)).filter("attribution", "eq", "{}");
}
console.log(`campaigns: ${campaignIds.size} · leads attributed now: ${attributed}`);
console.log("\ndone.");
