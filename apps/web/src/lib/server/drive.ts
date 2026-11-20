import "server-only";
import type { Db } from "./supabaseAdmin";
import { tokenRequest } from "./googleCalendar";
import { renderSignedPdf } from "./signedPdf";
import { backoffMinutes, DriveApi, DriveError, hasDriveScope, MAX_ATTEMPTS, RetryLater, saveToClientFolder, type DriveStore } from "./driveCore";

// Google Drive for a business: the signed-document PDF and any stored file are
// saved into a folder for the client. Everything goes through drive_jobs, so
// signing never waits on (or breaks because of) Google, and retries are safe.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export async function driveSettings(db: Db, orgId: string): Promise<Row | null> {
  const { data } = await db.from("drive_settings").select("*").eq("org_id", orgId).maybeSingle();
  return data;
}

async function accessToken(db: Db, orgId: string): Promise<string> {
  const { data: c } = await db.from("drive_credentials").select("*").eq("org_id", orgId).maybeSingle();
  if (!c) throw new DriveError("דרייב לא מחובר", 401);
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() > Date.now() + 60_000) return c.access_token;
  try {
    const t = await tokenRequest({ refresh_token: c.refresh_token, grant_type: "refresh_token" });
    await db.from("drive_credentials").update({ access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }).eq("org_id", orgId);
    return t.access_token;
  } catch (err) {
    throw new DriveError(`החיבור לגוגל פג — יש לחבר מחדש (${err instanceof Error ? err.message : ""})`, 401);
  }
}

export const driveApi = (db: Db, orgId: string) => new DriveApi(() => accessToken(db, orgId));

export function driveReady(s: Row | null): boolean {
  return !!s && hasDriveScope(s.scopes);
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

// Queue a save (idempotent: one job per document / file, ever).
export async function enqueueDriveSave(db: Db, input: { orgId: string; contactId: string; documentId?: string; fileId?: string; userId?: string | null }): Promise<string | null> {
  const kind = input.documentId ? "document" : "file";
  const col = kind === "document" ? "document_id" : "file_id";
  const id = (input.documentId ?? input.fileId)!;
  const { data: existing } = await db.from("drive_jobs").select("id").eq(col, id).eq("kind", kind).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db
    .from("drive_jobs")
    .insert({ org_id: input.orgId, contact_id: input.contactId, kind, [col]: id, created_by: input.userId ?? null })
    .select("id")
    .single();
  if (error) {
    // Lost a race with a parallel enqueue: the other job is the one.
    const { data: again } = await db.from("drive_jobs").select("id").eq(col, id).eq("kind", kind).maybeSingle();
    return again?.id ?? null;
  }
  return data.id;
}

// Hook for the signing flow: never throws.
export async function queueSignedDocument(db: Db, doc: Row): Promise<void> {
  try {
    if (!doc.contact_id) return;
    const s = await driveSettings(db, doc.org_id);
    if (!s || !s.auto_save_signed || !driveReady(s)) return;
    await enqueueDriveSave(db, { orgId: doc.org_id, contactId: doc.contact_id, documentId: doc.id });
  } catch (err) {
    console.error("drive enqueue failed", err);
  }
}

function storeFor(db: Db, s: Row, contact: Row): DriveStore {
  return {
    orgId: s.org_id,
    settings: { rootFolderId: s.root_folder_id, rootFolderName: s.root_folder_name, folderTemplate: s.folder_template },
    contact: { id: contact.id, name: contact.name, phone: contact.phone, email: contact.email, driveFolderId: contact.drive_folder_id },
    async setRootFolder(id, url) {
      await db.from("drive_settings").update({ root_folder_id: id, root_folder_url: url, updated_at: new Date().toISOString() }).eq("org_id", s.org_id);
    },
    async lockFolder() {
      const stale = new Date(Date.now() - 2 * 60_000).toISOString();
      const { data } = await db
        .from("contacts")
        .update({ drive_folder_lock_at: new Date().toISOString() })
        .eq("id", contact.id)
        .is("drive_folder_id", null)
        .or(`drive_folder_lock_at.is.null,drive_folder_lock_at.lt.${stale}`)
        .select("id");
      return !!data?.length;
    },
    async setFolder(id, url) {
      await db.from("contacts").update({ drive_folder_id: id, drive_folder_url: url, drive_folder_lock_at: null }).eq("id", contact.id);
    },
  };
}

async function payload(db: Db, job: Row, contact: Row): Promise<{ name: string; mime: string; bytes: Uint8Array; sourceId: string }> {
  if (job.kind === "document") {
    const { data: doc } = await db.from("documents").select("*").eq("id", job.document_id).maybeSingle();
    if (!doc) throw new DriveError("המסמך לא נמצא", 404);
    if (doc.status !== "signed") throw new DriveError("המסמך עוד לא נחתם");
    const { data: org } = await db.from("organizations").select("company_signature").eq("id", doc.org_id).maybeSingle();
    const bytes = await renderSignedPdf(doc, org?.company_signature ?? null);
    return { name: `${safeName(doc.title)} - ${safeName(contact.name)} (חתום).pdf`, mime: "application/pdf", bytes, sourceId: `doc:${doc.id}` };
  }
  const { data: f } = await db.from("files").select("*").eq("id", job.file_id).maybeSingle();
  if (!f) throw new DriveError("הקובץ לא נמצא", 404);
  const dl = await db.storage.from("files").download(f.path);
  if (dl.error || !dl.data) throw new DriveError("הורדת הקובץ מהמערכת נכשלה");
  return { name: safeName(f.name) || "file", mime: f.mime || "application/octet-stream", bytes: new Uint8Array(await dl.data.arrayBuffer()), sourceId: `file:${f.id}` };
}

async function failureAlert(db: Db, job: Row, contact: Row | null, message: string) {
  await db.from("notifications").insert({
    org_id: job.org_id,
    contact_id: job.contact_id,
    text: `📁 שמירה בדרייב נכשלה${contact?.name ? ` (${contact.name})` : ""}: ${message}`,
    url: "/settings/drive",
  });
  if (job.contact_id) await db.from("activities").insert({ org_id: job.org_id, contact_id: job.contact_id, type: "note", text: `📁 שמירה בדרייב נכשלה: ${message}` });
}

// Runs one claimed job; never throws.
async function runJob(db: Db, job: Row): Promise<"done" | "failed" | "retry"> {
  const fail = async (message: string, permanent: boolean, retryInMin?: number) => {
    const attempts = job.attempts + 1;
    const giveUp = permanent || attempts >= MAX_ATTEMPTS;
    await db
      .from("drive_jobs")
      .update({
        attempts,
        error: message,
        locked_at: null,
        status: giveUp ? "failed" : "pending",
        next_attempt_at: new Date(Date.now() + (retryInMin ?? backoffMinutes(attempts)) * 60_000).toISOString(),
      })
      .eq("id", job.id);
    if (giveUp) {
      await db.from("drive_settings").update({ last_error: message }).eq("org_id", job.org_id);
      const { data: contact } = await db.from("contacts").select("name").eq("id", job.contact_id).maybeSingle();
      await failureAlert(db, job, contact, message).catch(() => {});
    }
    return giveUp ? ("failed" as const) : ("retry" as const);
  };
  try {
    const s = await driveSettings(db, job.org_id);
    if (!s) return fail("דרייב לא מחובר לעסק", true);
    if (!hasDriveScope(s.scopes)) return fail("חסרה הרשאת דרייב — יש לחבר מחדש את גוגל בהגדרות › גוגל דרייב", true);
    const { data: contact } = await db.from("contacts").select("*").eq("id", job.contact_id).maybeSingle();
    if (!contact) return fail("הליד לא נמצא", true);
    const file = await payload(db, job, contact);
    const r = await saveToClientFolder(driveApi(db, job.org_id), storeFor(db, s, contact), file);
    const now = new Date().toISOString();
    await db.from("drive_jobs").update({ status: "done", done_at: now, locked_at: null, error: null, drive_file_id: r.fileId, drive_file_url: r.url, attempts: job.attempts + 1 }).eq("id", job.id);
    if (job.kind === "document") await db.from("documents").update({ drive_file_id: r.fileId, drive_url: r.url }).eq("id", job.document_id);
    else await db.from("files").update({ drive_file_id: r.fileId, drive_url: r.url, drive_synced_at: now }).eq("id", job.file_id);
    await db.from("drive_settings").update({ last_error: null }).eq("org_id", job.org_id);
    if (!r.reused) await db.from("activities").insert({ org_id: job.org_id, contact_id: job.contact_id, type: "note", text: `📁 נשמר בתיקיית הלקוח בדרייב: ${file.name}` });
    return "done";
  } catch (err) {
    if (err instanceof RetryLater) return fail("התיקייה בתהליך יצירה", false, 1);
    const status = err instanceof DriveError ? err.status : undefined;
    const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return fail(msg, status === 401 || status === 403 ? status === 401 : false);
  }
}

// Claims due jobs (optionally only for one org / one job) and runs them.
export async function processDriveJobs(db: Db, opts: { orgId?: string; jobId?: string; limit?: number } = {}): Promise<{ done: number; failed: number; retry: number }> {
  let query = db.from("drive_jobs").select("*").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(opts.limit ?? 10);
  if (opts.orgId) query = query.eq("org_id", opts.orgId);
  if (opts.jobId) query = query.eq("id", opts.jobId);
  const { data: jobs } = await query;
  const out = { done: 0, failed: 0, retry: 0 };
  for (const job of jobs ?? []) {
    const stale = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: claimed } = await db
      .from("drive_jobs")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending")
      .or(`locked_at.is.null,locked_at.lt.${stale}`)
      .select("*");
    if (!claimed?.length) continue;
    out[await runJob(db, claimed[0])]++;
  }
  return out;
}

// "Save this file to the client's Drive folder" — the reusable entry point for
// other features. Queues (once) and runs now, so the caller gets the link.
export async function saveFileToClientDrive(
  db: Db,
  input: { orgId: string; fileId: string; userId?: string | null }
): Promise<{ status: "done" | "pending" | "failed"; url?: string; folderUrl?: string; error?: string }> {
  const s = await driveSettings(db, input.orgId);
  if (!s) return { status: "failed", error: "דרייב לא מחובר — הגדרות › גוגל דרייב" };
  if (!hasDriveScope(s.scopes)) return { status: "failed", error: "חסרה הרשאת דרייב — יש לחבר מחדש את גוגל בהגדרות" };
  const { data: f } = await db.from("files").select("id, contact_id, org_id").eq("id", input.fileId).eq("org_id", input.orgId).maybeSingle();
  if (!f) return { status: "failed", error: "הקובץ לא נמצא" };
  if (!f.contact_id) return { status: "failed", error: "אפשר לשמור בדרייב רק קבצים של ליד" };
  const jobId = await enqueueDriveSave(db, { orgId: input.orgId, contactId: f.contact_id, fileId: f.id, userId: input.userId });
  if (!jobId) return { status: "failed", error: "יצירת המשימה נכשלה" };
  // A failed job being retried by hand starts over.
  await db.from("drive_jobs").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), locked_at: null }).eq("id", jobId).eq("status", "failed");
  await processDriveJobs(db, { orgId: input.orgId, jobId });
  const { data: job } = await db.from("drive_jobs").select("status, error, drive_file_url").eq("id", jobId).single();
  const { data: c } = await db.from("contacts").select("drive_folder_url").eq("id", f.contact_id).maybeSingle();
  return { status: job?.status ?? "pending", url: job?.drive_file_url ?? undefined, folderUrl: c?.drive_folder_url ?? undefined, error: job?.error ?? undefined };
}
