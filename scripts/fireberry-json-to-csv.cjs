// Converts the Fireberry API dump (exported from a logged-in browser through
// /api/v3/query) into CSVs shaped like Fireberry's own export, so
// scripts/import-fireberry.mjs reads them unchanged.
//
//   node scripts/fireberry-json-to-csv.cjs ~/Downloads/fireberry-sync.json ~/Downloads/fireberry-sync
//
// The dump is { exportedAt, objects: { "1007": leads[], "7": notes[], "6": meetings[], "10": tasks[], "9": users[] } }.
// Field lists used for the dump (objectType → fields):
//   1007: customobject1007id, name, pcfsystemfield104, 111, 124, 101, 102, 103, 112, 113, 122, 114, 115, 116, 117, 118,
//         109, 119, 120, 121, 127–134 (all pcfsystemfieldNNN), ownerid, createdon, modifiedon
//   7:    noteid, objectid, objecttitle, notetext, ownerid, ownername, createdon
//   6:    activityid, objectid, objecttitle, objecttypecode, objecttype, scheduledstart, scheduledend, statuscode, status,
//         pcfsystemfield100, pcfsystemfield101, pcfsystemfield104, subject, ownerid, ownername, createdon
//   10:   taskid, objectid, objecttitle, objecttypecode, objecttype, subject, statuscode, status, scheduledend, ownerid,
//         ownername, createdon
//   9:    crmuserid, roleid, statuscode, firstname, lastname, emailaddress1, username
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) {
  console.error("usage: node scripts/fireberry-json-to-csv.cjs <dump.json> <out dir>");
  process.exit(1);
}
const { objects } = JSON.parse(fs.readFileSync(src, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const write = (name, rows) =>
  fs.writeFileSync(
    path.join(outDir, `${name}.csv`),
    Papa.unparse(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)]))))
  );

// Fireberry's own automatic notes (webhook calls, emails, status logs) are
// marked so the importer skips them.
const SYSTEM = /^\s*(בוצעה קריאה לכתובת|דואר אלקטרוני נשלח ל|סטטוס .{0,20}השתנה מ)/;

write("משתמשים", objects["9"]);
write("לידים", objects["1007"].map((l) => ({ ...l, owneridname: l.owneridname ?? "" })));
const notes = objects["7"].map((n) => ({ ...n, issystem: SYSTEM.test((n.notetext ?? "").replace(/<[^>]+>/g, " ")) ? "1" : "0" }));
write("הערות", notes);
write("פגישות", objects["6"]);
write("משימות", objects["10"]);
console.log({
  users: objects["9"].length,
  leads: objects["1007"].length,
  notes: notes.length,
  manualNotes: notes.filter((n) => n.issystem === "0").length,
  meetings: objects["6"].length,
  tasks: objects["10"].length,
  openTasks: objects["10"].filter((t) => t.status === "פתוח").length,
});
