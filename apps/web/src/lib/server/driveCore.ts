// Pure Google Drive logic (no framework imports) so it can be unit-tested with
// mocks: the Drive REST client and the "save a file into a client's folder"
// orchestration. The Supabase wiring lives in drive.ts.

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FULL_SCOPE = "https://www.googleapis.com/auth/drive";

// True when the granted scopes (Google's space-separated string) let us write.
export function hasDriveScope(granted: string | null | undefined): boolean {
  const s = (granted ?? "").split(/\s+/);
  return s.includes(DRIVE_FILE_SCOPE) || s.includes(DRIVE_FULL_SCOPE);
}

export class DriveError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}
// Not a failure: try again shortly (e.g. another worker is creating the folder).
export class RetryLater extends Error {}

export function renderFolderName(template: string, c: { name?: string | null; phone?: string | null; email?: string | null }): string {
  const values: Record<string, string> = { name: c.name ?? "", phone: c.phone ?? "", email: c.email ?? "" };
  const out = (template || "{{name}}")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => values[k] ?? "")
    .replace(/[\\/\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(\s*[-–|·]\s*)+$/, "")
    .trim();
  return (out || c.name?.trim() || "לקוח ללא שם").slice(0, 150);
}

// Accepts a Drive folder URL or a bare id.
export function parseFolderRef(input: string): string | null {
  const t = input.trim();
  const m = t.match(/\/folders\/([\w-]{10,})/) ?? t.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(t) ? t : null;
}

const q = (v: string) => `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const FOLDER_MIME = "application/vnd.google-apps.folder";
type Fetch = typeof fetch;
export type DriveFile = { id: string; name?: string; webViewLink?: string; trashed?: boolean; mimeType?: string };

export class DriveApi {
  private token: () => Promise<string>;
  private fetchImpl: Fetch;
  constructor(token: () => Promise<string>, fetchImpl: Fetch = fetch) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${await this.token()}`, ...(init.headers ?? {}) } });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new DriveError(`Google Drive ${res.status}: ${body.error?.message ?? ""}`.trim(), res.status);
    }
    return res;
  }

  async get(id: string): Promise<DriveFile> {
    const r = await this.call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,webViewLink,trashed,mimeType&supportsAllDrives=true`);
    return r.json();
  }

  // First live file/folder carrying a CRM property (how retries find what an earlier run already made).
  async findByProp(key: string, value: string, parentId?: string): Promise<DriveFile | null> {
    const parts = [`appProperties has { key=${q(key)} and value=${q(value)} }`, "trashed = false"];
    if (parentId) parts.push(`${q(parentId)} in parents`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(parts.join(" and "))}&fields=${encodeURIComponent("files(id,name,webViewLink)")}&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const r = await this.call(url);
    return ((await r.json()) as { files?: DriveFile[] }).files?.[0] ?? null;
  }

  async createFolder(name: string, parentId: string | null, props: Record<string, string>): Promise<DriveFile> {
    const r = await this.call("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}), appProperties: props }),
    });
    return r.json();
  }

  // Resumable upload (works for small and large files with one code path).
  async uploadFile(name: string, mime: string, bytes: Uint8Array, parentId: string, props: Record<string, string>): Promise<DriveFile> {
    const init = await this.call("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink&supportsAllDrives=true", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(bytes.length) },
      body: JSON.stringify({ name, parents: [parentId], appProperties: props }),
    });
    const location = init.headers.get("location");
    if (!location) throw new DriveError("Google Drive: no upload session");
    const done = await this.call(location, { method: "PUT", headers: { "Content-Type": mime }, body: bytes as unknown as BodyInit });
    return done.json();
  }
}

// What the orchestration needs from the database.
export type DriveStore = {
  settings: { rootFolderId: string | null; rootFolderName: string; folderTemplate: string };
  contact: { id: string; name: string; phone?: string | null; email?: string | null; driveFolderId: string | null };
  orgId: string;
  setRootFolder(id: string, url: string | null): Promise<void>;
  // Atomic: true only for one caller at a time while the folder is being made.
  lockFolder(): Promise<boolean>;
  setFolder(id: string | null, url: string | null): Promise<void>;
};

const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

async function ensureRoot(drive: DriveApi, st: DriveStore): Promise<string> {
  if (st.settings.rootFolderId) return st.settings.rootFolderId;
  const existing = await drive.findByProp("crmRootOrg", st.orgId);
  const f = existing ?? (await drive.createFolder(st.settings.rootFolderName || "לקוחות CRM", null, { crmRootOrg: st.orgId }));
  await st.setRootFolder(f.id, f.webViewLink ?? folderUrl(f.id));
  st.settings.rootFolderId = f.id;
  return f.id;
}

// The client's folder: reuse it, find the one an earlier run made, or create it.
export async function ensureClientFolder(drive: DriveApi, st: DriveStore): Promise<{ id: string; url: string }> {
  if (st.contact.driveFolderId) {
    try {
      const f = await drive.get(st.contact.driveFolderId);
      if (!f.trashed) return { id: f.id, url: f.webViewLink ?? folderUrl(f.id) };
    } catch (e) {
      // Deleted by hand in Drive → make a fresh one; anything else is a real error.
      if (!(e instanceof DriveError && (e.status === 404 || e.status === 403))) throw e;
    }
    await st.setFolder(null, null);
    st.contact.driveFolderId = null;
  }
  if (!(await st.lockFolder())) throw new RetryLater("folder is being created");
  try {
    const root = await ensureRoot(drive, st);
    const found = await drive.findByProp("crmContactId", st.contact.id, root);
    const f = found ?? (await drive.createFolder(renderFolderName(st.settings.folderTemplate, st.contact), root, { crmContactId: st.contact.id }));
    const url = f.webViewLink ?? folderUrl(f.id);
    await st.setFolder(f.id, url);
    st.contact.driveFolderId = f.id;
    return { id: f.id, url };
  } catch (e) {
    await st.setFolder(null, null).catch(() => {}); // releases the lock
    throw e;
  }
}

// Saves one file into the client's folder. Idempotent per `sourceId`: a retry
// (or a second click) finds the earlier upload and returns it.
export async function saveToClientFolder(
  drive: DriveApi,
  st: DriveStore,
  file: { name: string; mime: string; bytes: Uint8Array; sourceId: string }
): Promise<{ fileId: string; url: string; folderUrl: string; reused: boolean }> {
  const folder = await ensureClientFolder(drive, st);
  const existing = await drive.findByProp("crmSourceId", file.sourceId, folder.id);
  if (existing) return { fileId: existing.id, url: existing.webViewLink ?? `https://drive.google.com/file/d/${existing.id}/view`, folderUrl: folder.url, reused: true };
  const up = await drive.uploadFile(file.name, file.mime, file.bytes, folder.id, { crmSourceId: file.sourceId, crmContactId: st.contact.id });
  return { fileId: up.id, url: up.webViewLink ?? `https://drive.google.com/file/d/${up.id}/view`, folderUrl: folder.url, reused: false };
}

// Retry schedule: 1, 5, 30 minutes, 2 hours, then give up (visible as failed).
export const MAX_ATTEMPTS = 5;
export const backoffMinutes = (attempts: number) => [1, 5, 30, 120][Math.min(attempts, 4) - 1] ?? 120;
