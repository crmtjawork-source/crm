import "server-only";
import type { AiConfig } from "./ai/settings";

// Fetching a recording that lives behind a link. Returns the bytes; the caller
// stores them in our "files" bucket. Everything here fails with a Hebrew message
// telling the user exactly what to do (share settings, missing Zoom credentials).

export const MAX_FETCH_BYTES = 150 * 1024 * 1024;

export type FetchedFile = { data: Uint8Array; filename: string; mime: string };

export function classifyLink(url: string): "zoom" | "drive" | "link" {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    throw new Error("הקישור לא תקין");
  }
  if (/(^|\.)zoom\.(us|com)$/.test(host)) return "zoom";
  if (/(^|\.)(drive|docs)\.google\.com$/.test(host)) return "drive";
  return "link";
}

async function readLimited(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_FETCH_BYTES) throw new Error(`הקובץ גדול מדי (${Math.round(declared / 1048576)}MB, המקסימום ${MAX_FETCH_BYTES / 1048576}MB) — אפשר להעלות אותו ידנית`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_FETCH_BYTES) throw new Error("הקובץ גדול מדי — אפשר להעלות אותו ידנית");
  return buf;
}

const isMedia = (type: string) => /^(audio|video)\//.test(type) || type === "application/octet-stream";

export function driveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([\w-]{10,})/) ?? url.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
}

// Google Drive: works for files shared as "anyone with the link". Private files
// would need the org's Google connection with Drive scope (not wired yet).
export async function fetchDrive(url: string): Promise<FetchedFile> {
  const id = driveFileId(url);
  if (!id) throw new Error("לא זוהה קובץ בקישור הדרייב. צריך קישור לקובץ עצמו (לא לתיקייה)");
  let res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { redirect: "follow" });
  let type = res.headers.get("content-type") ?? "";
  if (type.startsWith("text/html")) {
    // Big files: Google shows a "can't scan for viruses" page with a confirm form.
    const html = await res.text();
    const action = html.match(/action="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    if (!action || /accounts\.google|ServiceLogin/.test(html)) throw new Error("אין גישה לקובץ בדרייב. יש לשתף אותו כ'כל מי שיש לו קישור' (צפייה), או להעלות את הקובץ ידנית");
    const params = new URLSearchParams();
    for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) params.set(m[1], m[2].replace(/&amp;/g, "&"));
    res = await fetch(`${action}?${params}`, { redirect: "follow" });
    type = res.headers.get("content-type") ?? "";
    if (type.startsWith("text/html")) throw new Error("אין גישה לקובץ בדרייב. יש לשתף אותו כ'כל מי שיש לו קישור' (צפייה)");
  }
  if (!res.ok) throw new Error(`הורדה מדרייב נכשלה (${res.status})`);
  const cd = res.headers.get("content-disposition") ?? "";
  const filename = decodeURIComponent(cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] ?? `drive-${id}.m4a`);
  return { data: await readLimited(res), filename, mime: type || "application/octet-stream" };
}

// Zoom: a "cloud recording share link" can't be downloaded without the account's
// API. With a Server-to-Server OAuth app (account id / client id / secret) we list
// the account's recordings and match the link to a meeting by its share_url.
export async function fetchZoom(url: string, cfg: AiConfig): Promise<FetchedFile> {
  if (!cfg.zoom) throw new Error("כדי למשוך הקלטת זום מקישור צריך לחבר אפליקציית Zoom (Server-to-Server OAuth) בהגדרות ← תמלול ו-AI. אפשר גם להוריד את ההקלטה מזום ולהעלות אותה ידנית");
  const { accountId, clientId, clientSecret } = cfg.zoom;
  const tokenRes = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
  });
  const tok = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tok.access_token) throw new Error(`התחברות לזום נכשלה: ${tok.reason ?? tok.error ?? tokenRes.status}`);
  const auth = { Authorization: `Bearer ${tok.access_token}` };
  const wanted = new URL(url).pathname.replace(/\/+$/, "");
  const day = (d: Date) => d.toISOString().slice(0, 10);
  // Zoom lists at most one month per request; look back six months.
  for (let back = 0; back < 6; back++) {
    const to = new Date(Date.now() - back * 30 * 864e5);
    const from = new Date(to.getTime() - 30 * 864e5);
    let next = "";
    do {
      const res = await fetch(`https://api.zoom.us/v2/users/me/recordings?from=${day(from)}&to=${day(to)}&page_size=300${next ? `&next_page_token=${next}` : ""}`, { headers: auth });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`זום: ${json.message ?? res.status}`);
      for (const meeting of json.meetings ?? []) {
        if (!meeting.share_url || new URL(meeting.share_url).pathname.replace(/\/+$/, "") !== wanted) continue;
        const files: Array<{ file_type: string; download_url: string; file_extension?: string; status?: string }> = meeting.recording_files ?? [];
        const file = files.find((f) => f.file_type === "M4A") ?? files.find((f) => f.file_type === "MP4");
        if (!file) throw new Error("ההקלטה בזום עדיין לא מוכנה או שאין בה קובץ אודיו/וידאו");
        const dl = await fetch(file.download_url, { headers: auth, redirect: "follow" });
        if (!dl.ok) throw new Error(`הורדה מזום נכשלה (${dl.status})`);
        const ext = (file.file_extension ?? file.file_type).toLowerCase();
        return { data: await readLimited(dl), filename: `zoom-${String(meeting.id ?? "recording")}.${ext}`, mime: ext === "mp4" ? "video/mp4" : "audio/mp4" };
      }
      next = json.next_page_token ?? "";
    } while (next);
  }
  throw new Error("לא נמצאה בחשבון הזום הקלטה שמתאימה לקישור (נבדקו 6 החודשים האחרונים)");
}

export async function fetchDirect(url: string): Promise<FetchedFile> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`הורדת הקובץ נכשלה (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!isMedia(type)) throw new Error("הקישור לא מוביל לקובץ אודיו/וידאו. אפשר לצרף קישור ישיר לקובץ, קישור דרייב או קישור זום");
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "recording");
  return { data: await readLimited(res), filename: name, mime: type };
}

export async function fetchLink(kind: "zoom" | "drive" | "link", url: string, cfg: AiConfig): Promise<FetchedFile> {
  return kind === "zoom" ? fetchZoom(url, cfg) : kind === "drive" ? fetchDrive(url) : fetchDirect(url);
}
