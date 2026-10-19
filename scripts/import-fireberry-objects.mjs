#!/usr/bin/env node
// Imports Fireberry objects beyond leads (e.g. clients, properties) as the
// CRM's custom objects: the object, its fields (types, option lists with
// colours, relations) and every record. Reads the JSON the browser export
// produces ({schema: {type: fields[]}, data: {type: rows[]}, users: []}).
//
//   node scripts/import-fireberry-objects.mjs --file ~/Downloads/fireberry-ops.json --org <uuid> \
//     --object "14|נכסים|נכס|🏠" --object "1|לקוחות|לקוח|🤝" [--commit]
//
// Objects are imported in the order given — import a relation's target first
// (properties before the clients that point at them). Re-running is safe:
// fields are matched by their Fireberry name and records by external_ref, so
// existing ones are updated, never duplicated. Without --commit: dry run.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => argv[argv.indexOf(`--${name}`) + 1];
const many = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
const FILE = String(opt("file") ?? "").replace(/^~/, homedir());
const ORG = opt("org");
const COMMIT = flag("commit");
const OBJECTS = many("object").map((s) => {
  const [fbType, name, singular, icon] = s.split("|");
  return { fbType, name, singular, icon };
});
if (!FILE || !ORG || !OBJECTS.length) {
  console.error('usage: node scripts/import-fireberry-objects.mjs --file <json> --org <uuid> --object "<fbType>|<name>|<singular>|<icon>" ... [--commit]');
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

// ------------------------------------------------------------------ helpers
const COLORS = ["#64748b", "#2563eb", "#0891b2", "#059669", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed"];
const empty = (v) => v === null || v === undefined || v === "" || (typeof v === "string" && !v.trim());
const normalizePhone = (phone) => {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  return /^0\d{8,9}$/.test(d) ? `972${d.slice(1)}` : d;
};
// Fireberry's query API returns Israel wall-clock time marked "Z".
function israelToIso(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local - utc)).toISOString();
}
// System fields that are bookkeeping, not business data.
const SKIP = new Set([
  "createdby", "modifiedby", "createdon", "modifiedon", "statecode", "isvalidforemailcode", "accountnumber", "accountageindays",
  "lastactiondate", "duplicaterecordcode", "primarycontactid", "campaignid", "lastconversation", "parentaccountid", "accountid",
  "productid", "catalognumber", "nextactiondate", "nextactivitydate", "recordurl", "deleted", "sitename", "systemfield10",
]);
const MONEY = /מחיר|סכום|הון|תקציב|עלות|שכר/;

// Team members by first name (Fireberry users rarely carry an email).
const { data: team } = await db
  .from("memberships")
  .select("users(email, full_name)")
  .eq("org_id", ORG)
  .then(async (r) => {
    const { data: inv } = await db.from("invitations").select("email, name").eq("org_id", ORG);
    return { data: [...(r.data ?? []).map((m) => ({ email: m.users?.email, name: m.users?.full_name })), ...(inv ?? []).map((i) => ({ email: i.email, name: i.name }))] };
  });
const fbUsers = Object.fromEntries((exp.users ?? []).map((u) => [String(u.crmuserid ?? u._id ?? "").toUpperCase(), `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim()]));
function userEmail(fbId, fbName) {
  const name = fbUsers[String(fbId ?? "").toUpperCase()] || fbName || "";
  const first = name.split(/\s+/)[0];
  return team.find((t) => t.name && (t.name === name || t.name.split(/\s+/)[0] === first))?.email ?? null;
}

const { data: contacts } = await db.from("contacts").select("id, phone_digits").eq("org_id", ORG).not("phone_digits", "is", null);
const contactByPhone = new Map((contacts ?? []).map((c) => [c.phone_digits, c.id]));

// fbType → our object_type id; Fireberry record id → our record id.
const typeIds = {};
const recordIds = new Map();
// Relations to objects imported later in the run, completed at the end.
const pending = [];

// ------------------------------------------------------------------ import
for (const obj of OBJECTS) {
  const schema = exp.schema[obj.fbType] ?? [];
  const rows = exp.data[obj.fbType] ?? [];
  const has = (name) => rows.some((r) => !empty(r[name]));
  console.log(`\n== ${obj.name} (Fireberry ${obj.fbType}): ${rows.length} records`);

  const titleField = schema.find((f) => ["accountname", "name", "productname", "fullname"].includes(f.name))?.name ?? schema[0].name;
  const stageField = schema.find((f) => f.type === "picklist" && f.name === "statuscode")?.name;

  // Fields: business fields (custom ones always, system ones when used); one
  // per label — a duplicate label keeps the copy that holds data.
  const picked = [];
  for (const f of schema) {
    if (SKIP.has(f.name) || f.name === "_id") continue;
    const isOwner = f.name === "ownerid";
    if (f.type === "lookup" && !isOwner && !OBJECTS.some((o) => String(o.fbType) === String(f.lookup))) continue;
    if (!f.custom && !has(f.name) && f.name !== titleField && f.name !== stageField) continue;
    const label = f.label.trim();
    const dupe = picked.find((p) => p.label === label);
    if (dupe) {
      if (!has(dupe.fb) && has(f.name)) picked.splice(picked.indexOf(dupe), 1);
      else continue;
    }
    let type = { phone: "phone", email: "email", url: "url", textarea: "long_text", date: "date", datetime: "datetime", text: "text" }[f.type] ?? "text";
    if (f.type === "number") type = MONEY.test(label) ? "currency" : "number";
    if (f.type === "picklist") type = "select";
    if (f.type === "lookup") type = isOwner ? "user" : "relation";
    picked.push({
      fb: f.name,
      key: f.name,
      label,
      type,
      relationFb: f.type === "lookup" && !isOwner ? String(f.lookup) : null,
      options: (f.options ?? []).map((o, i) => ({ value: String(o.v), label: o.l, color: o.color || COLORS[(i + 1) % COLORS.length] })),
      custom: f.custom,
    });
  }
  // Order: title, stage, contact details, owner, then the rest as in Fireberry.
  const rank = (p) => (p.fb === titleField ? 0 : p.fb === stageField ? 1 : ["phone", "email"].includes(p.type) ? 2 : p.type === "user" ? 3 : p.type === "relation" ? 4 : p.custom ? 6 : 5);
  picked.sort((a, b) => rank(a) - rank(b));
  const listCols = new Set(picked.filter((p) => rank(p) <= 4).slice(0, 5).map((p) => p.key));
  for (const p of picked) if (/^עיר|מחיר מבוקש|^סוג עסקה/.test(p.label)) listCols.add(p.key);
  console.log(`   ${picked.length} fields: ${picked.map((p) => `${p.label}[${p.type}]`).join(", ")}`);

  if (!COMMIT) {
    typeIds[obj.fbType] = `dry-${obj.fbType}`;
    continue;
  }

  // Object type (reused when it already exists).
  let { data: type } = await db.from("object_types").select("*").eq("org_id", ORG).eq("name", obj.name).maybeSingle();
  if (!type) {
    const { count } = await db.from("object_types").select("id", { count: "exact", head: true }).eq("org_id", ORG);
    ({ data: type } = await db
      .from("object_types")
      .insert({ org_id: ORG, name: obj.name, singular: obj.singular, icon: obj.icon || null, position: count ?? 0, title_field: titleField, stage_field: stageField ?? null })
      .select()
      .single());
  }
  typeIds[obj.fbType] = type.id;
  const { data: existingFields } = await db.from("object_fields").select("key").eq("object_type_id", type.id);
  const known = new Set((existingFields ?? []).map((f) => f.key));
  const newFields = picked
    .filter((p) => !known.has(p.key))
    .map((p, i) => ({
      org_id: ORG,
      object_type_id: type.id,
      key: p.key,
      label: p.label,
      type: p.type,
      options: p.options,
      relation_type_id: p.relationFb ? typeIds[p.relationFb] ?? null : null,
      section: obj.fbType === "1" && p.custom && rank(p) >= 5 ? "העדפות חיפוש" : null,
      show_in_list: listCols.has(p.key),
      position: (existingFields?.length ?? 0) + i,
    }));
  if (newFields.length) {
    const { error } = await db.from("object_fields").insert(newFields);
    if (error) throw error;
  }
  console.log(`   object ${type.id}: ${newFields.length} new fields`);

  // Records.
  let linked = 0;
  const payload = rows.map((r) => {
    const data = {};
    for (const p of picked) {
      const v = r[p.fb];
      if (empty(v)) continue;
      if (p.type === "select") data[p.key] = String(v);
      else if (p.type === "user") data[p.key] = userEmail(v, r[`${p.fb.replace(/id$/, "")}name`] ?? r.ownername);
      else if (p.type === "relation") {
        data[p.key] = recordIds.get(String(v).toUpperCase()) ?? null;
        if (!data[p.key]) pending.push({ ref: `fireberry:${obj.fbType}:${String(r._id).toUpperCase()}`, key: p.key, target: String(v).toUpperCase() });
      }
      else if (p.type === "number" || p.type === "currency") data[p.key] = Number(v);
      else if (p.type === "date") data[p.key] = String(v).slice(0, 10);
      else if (p.type === "datetime") data[p.key] = israelToIso(v);
      else data[p.key] = String(v).trim();
      if (data[p.key] === null) delete data[p.key];
    }
    const phone = picked.filter((p) => p.type === "phone").map((p) => normalizePhone(r[p.fb])).find((d) => d && contactByPhone.has(d));
    if (phone) linked++;
    const id = String(r._id).toUpperCase();
    return {
      id,
      row: {
        org_id: ORG,
        object_type_id: type.id,
        title: String(r[titleField] ?? "").trim(),
        data,
        owner_email: data.ownerid ?? null,
        contact_id: phone ? contactByPhone.get(phone) : null,
        external_ref: `fireberry:${obj.fbType}:${id}`,
        created_at: israelToIso(r.createdon) ?? new Date().toISOString(),
      },
    };
  });
  for (let i = 0; i < payload.length; i += 200) {
    const { data: saved, error } = await db
      .from("records")
      .upsert(payload.slice(i, i + 200).map((p) => p.row), { onConflict: "org_id,external_ref" })
      .select("id, external_ref");
    if (error) throw error;
    for (const s of saved) recordIds.set(s.external_ref.split(":").pop(), s.id);
  }
  console.log(`   ${payload.length} records saved, ${linked} linked to an existing lead by phone`);
}
// Second pass: relations whose target object came later in the run.
if (COMMIT) {
  for (const obj of OBJECTS) {
    const fields = (exp.schema[obj.fbType] ?? []).filter((f) => f.type === "lookup" && typeIds[String(f.lookup)] && String(f.lookup) !== "9");
    for (const f of fields)
      await db.from("object_fields").update({ relation_type_id: typeIds[String(f.lookup)] }).eq("object_type_id", typeIds[obj.fbType]).eq("key", f.name).is("relation_type_id", null);
  }
  let fixed = 0;
  for (const p of pending) {
    const target = recordIds.get(p.target);
    if (!target) continue;
    const { data: rec } = await db.from("records").select("id, data").eq("org_id", ORG).eq("external_ref", p.ref).single();
    await db.from("records").update({ data: { ...rec.data, [p.key]: target } }).eq("id", rec.id);
    fixed++;
  }
  console.log(`\n${fixed} links between objects completed`);
} else console.log("\nDry run — nothing written. Add --commit to import.");
