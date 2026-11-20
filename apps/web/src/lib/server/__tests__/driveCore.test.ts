/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Run: node --test apps/web/src/lib/server/__tests__/driveCore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DriveApi, DriveError, RetryLater, backoffMinutes, ensureClientFolder, hasDriveScope, parseFolderRef, renderFolderName, saveToClientFolder, type DriveStore } from "../driveCore.ts";

// A tiny in-memory Google Drive behind a fake fetch.
function fakeDrive() {
  const files = new Map<string, { id: string; name: string; parents: string[]; props: Record<string, string>; trashed?: boolean; mime?: string }>();
  let n = 0;
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push(`${method} ${url.split("?")[0].replace("https://www.googleapis.com", "")}`);
    const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers });
    if (url.includes("/upload/drive/v3/files") && method === "POST") {
      const meta = JSON.parse(String(init.body));
      return json({}, 200, { location: `https://upload.test/session/${encodeURIComponent(JSON.stringify(meta))}` });
    }
    if (url.startsWith("https://upload.test/session/") && method === "PUT") {
      const meta = JSON.parse(decodeURIComponent(url.split("/session/")[1]));
      const id = `f${++n}`;
      files.set(id, { id, name: meta.name, parents: meta.parents, props: meta.appProperties });
      return json({ id, name: meta.name, webViewLink: `https://drive.google.com/file/d/${id}/view` });
    }
    if (url.includes("/drive/v3/files?") && method === "POST") {
      const b = JSON.parse(String(init.body));
      const id = `d${++n}`;
      files.set(id, { id, name: b.name, parents: b.parents ?? [], props: b.appProperties, mime: b.mimeType });
      return json({ id, name: b.name, webViewLink: `https://drive.google.com/drive/folders/${id}` });
    }
    if (url.includes("/drive/v3/files?") && method === "GET") {
      const qs = decodeURIComponent(new URL(url).searchParams.get("q")!);
      const [, key, value] = qs.match(/key='([^']+)' and value='([^']+)'/)!;
      const parent = qs.match(/'([^']+)' in parents/)?.[1];
      const hit = [...files.values()].find((f) => f.props?.[key] === value && !f.trashed && (!parent || f.parents.includes(parent)));
      return json({ files: hit ? [{ id: hit.id, name: hit.name, webViewLink: `https://drive.google.com/x/${hit.id}` }] : [] });
    }
    const m = url.match(/\/drive\/v3\/files\/([^?]+)/);
    if (m && method === "GET") {
      const f = files.get(decodeURIComponent(m[1]));
      return f ? json({ id: f.id, name: f.name, trashed: !!f.trashed, mimeType: f.mime, webViewLink: `https://drive.google.com/drive/folders/${f.id}` }) : json({ error: { message: "File not found" } }, 404);
    }
    return json({ error: { message: "unexpected " + url } }, 500);
  }) as typeof fetch;
  return { api: new DriveApi(async () => "tok", fetchImpl), files, calls };
}

function fakeStore(over: Partial<DriveStore["contact"]> = {}) {
  const state = { lock: false, folderId: over.driveFolderId ?? (null as string | null), url: null as string | null, root: null as string | null, sets: 0 };
  const st: DriveStore = {
    orgId: "org1",
    settings: { rootFolderId: null, rootFolderName: "לקוחות CRM", folderTemplate: "{{name}}" },
    contact: { id: "c1", name: "ישראל ישראלי", phone: "0501234567", email: null, driveFolderId: state.folderId, ...over },
    async setRootFolder(id) {
      state.root = id;
    },
    async lockFolder() {
      if (state.lock) return false;
      state.lock = true;
      return true;
    },
    async setFolder(id, url) {
      state.folderId = id;
      state.url = url;
      state.lock = false;
      state.sets++;
    },
  };
  return { st, state };
}
const pdf = (sourceId: string) => ({ name: "הסכם (חתום).pdf", mime: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]), sourceId });
const folders = (d: ReturnType<typeof fakeDrive>) => [...d.files.values()].filter((f) => f.mime === "application/vnd.google-apps.folder");

test("folder name template", () => {
  assert.equal(renderFolderName("{{name}}", { name: "ישראל ישראלי" }), "ישראל ישראלי");
  assert.equal(renderFolderName("{{name}} - {{phone}}", { name: "דנה", phone: "0501" }), "דנה - 0501");
  assert.equal(renderFolderName("{{name}} - {{phone}}", { name: "דנה" }), "דנה"); // empty tail trimmed
  assert.equal(renderFolderName("{{name}}", { name: "א/ב\\ג" }), "א ב ג");
  assert.equal(renderFolderName("{{phone}}", { name: "דנה" }), "דנה"); // empty result falls back to the name
});

test("scope detection and folder refs", () => {
  assert.equal(hasDriveScope("openid email https://www.googleapis.com/auth/drive.file"), true);
  assert.equal(hasDriveScope("openid email"), false);
  assert.equal(hasDriveScope(null), false);
  assert.equal(parseFolderRef("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn?usp=sharing"), "1AbCdEfGhIjKlMn");
  assert.equal(parseFolderRef("1AbCdEfGhIjKlMn"), "1AbCdEfGhIjKlMn");
  assert.equal(parseFolderRef("hello"), null);
});

test("first save creates root + client folder and uploads once", async () => {
  const d = fakeDrive();
  const { st, state } = fakeStore();
  const r = await saveToClientFolder(d.api, st, pdf("doc:1"));
  assert.equal(r.reused, false);
  assert.equal(folders(d).length, 2); // root + client
  assert.equal(folders(d).find((f) => f.props.crmContactId === "c1")!.name, "ישראל ישראלי");
  assert.ok(state.folderId && state.root);
  assert.equal([...d.files.values()].filter((f) => f.props.crmSourceId === "doc:1").length, 1);
});

test("retry of the same document does not duplicate folder or file", async () => {
  const d = fakeDrive();
  const a = fakeStore();
  await saveToClientFolder(d.api, a.st, pdf("doc:1"));
  // A retry where the DB write-back was lost (folder id unknown to the DB) still finds the same folder by its property.
  const b = fakeStore();
  b.st.settings.rootFolderId = a.state.root;
  const r = await saveToClientFolder(d.api, b.st, pdf("doc:1"));
  assert.equal(r.reused, true);
  assert.equal(folders(d).length, 2);
  assert.equal([...d.files.values()].filter((f) => f.props.crmSourceId === "doc:1").length, 1);
});

test("a second document goes into the same client folder", async () => {
  const d = fakeDrive();
  const { st } = fakeStore();
  await saveToClientFolder(d.api, st, pdf("doc:1"));
  await saveToClientFolder(d.api, st, pdf("file:9"));
  assert.equal(folders(d).length, 2);
  assert.equal([...d.files.values()].filter((f) => f.props.crmSourceId).length, 2);
});

test("a folder someone deleted in Drive is recreated", async () => {
  const d = fakeDrive();
  const { st } = fakeStore();
  const first = await ensureClientFolder(d.api, st);
  d.files.get(first.id)!.trashed = true;
  const second = await ensureClientFolder(d.api, st);
  assert.notEqual(second.id, first.id);
});

test("a concurrent creation is told to retry, not duplicated", async () => {
  const d = fakeDrive();
  const { st, state } = fakeStore();
  state.lock = true; // another worker holds the lock
  await assert.rejects(saveToClientFolder(d.api, st, pdf("doc:1")), RetryLater);
  assert.equal(folders(d).length, 0);
});

test("a Drive failure releases the lock and surfaces the error", async () => {
  const { st, state } = fakeStore();
  const broken = new DriveApi(async () => "tok", (async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 500 })) as typeof fetch);
  await assert.rejects(ensureClientFolder(broken, st), (e: unknown) => e instanceof DriveError && e.status === 500);
  assert.equal(state.lock, false);
});

test("retry back-off grows and caps", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(backoffMinutes), [1, 5, 30, 120, 120]);
});
