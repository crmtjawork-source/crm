"use client";

import { confirmAction } from "@/lib/confirm";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MAX = 25 * 1024 * 1024;
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const icon = (mime = "", name = "") =>
  mime.startsWith("image/") ? "🖼️" : mime.startsWith("video/") ? "🎬" : mime.startsWith("audio/") ? "🎧" : /pdf/.test(mime) || name.endsWith(".pdf") ? "📄" : /sheet|excel|csv/.test(mime) ? "📊" : "📎";

const fetchFiles = async (column: "contact_id" | "record_id", id: string) =>
  (await supabase.from("files").select("*").eq(column, id).order("position").order("created_at", { ascending: false })).data ?? [];

const isImg = (f: Row) => (f.mime ?? "").startsWith("image/") && !/svg/.test(f.mime);

// Phone photos are huge: shrink to 2000px JPEG before uploading (keeps galleries fast).
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || /svg|gif/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

// Files on a lead or a record: upload several at once, open, delete.
export function FilesSection({ contactId, recordId }: { contactId?: string; recordId?: string }) {
  const { orgId } = useStore();
  const [files, setFiles] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState<string | null>(null);
  const column = contactId ? "contact_id" : "record_id";
  const id = (contactId ?? recordId)!;

  useEffect(() => {
    fetchFiles(column, id).then(setFiles);
  }, [column, id]);

  useEffect(() => {
    if (!contactId) return;
    supabase.from("contacts").select("drive_folder_url").eq("id", contactId).maybeSingle().then(({ data }) => setFolderUrl(data?.drive_folder_url ?? null));
  }, [contactId, files.length]);

  async function toDrive(f: Row) {
    setDriveBusy(f.id);
    setError("");
    try {
      const r = await apiPost<{ status: string; url?: string; folderUrl?: string; error?: string }>("/api/integrations/drive/save", { fileId: f.id });
      if (r.status === "done") {
        setFolderUrl(r.folderUrl ?? null);
        setFiles(await fetchFiles(column, id));
      } else setError(r.error ?? "השמירה בדרייב נכשלה — תנסה שוב אוטומטית. אפשר לראות סטטוס בהגדרות › גוגל דרייב");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השמירה בדרייב נכשלה");
    }
    setDriveBusy(null);
  }

  // Thumbnails for the gallery (records only).
  useEffect(() => {
    if (column !== "record_id") return;
    const imgs = files.filter((f) => isImg(f) && !thumbs[f.id]);
    if (!imgs.length) return;
    supabase.storage
      .from("files")
      .createSignedUrls(imgs.map((f) => f.path), 3600)
      .then(({ data }) => setThumbs((t) => ({ ...t, ...Object.fromEntries((data ?? []).map((d, i) => [imgs[i].id, d.signedUrl ?? ""])) })));
  }, [files, column, thumbs]);

  // Moves an image one step in the gallery order (first = cover).
  async function move(f: Row, dir: -1 | 1) {
    const imgs = files.filter(isImg);
    const i = imgs.findIndex((x) => x.id === f.id);
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    await Promise.all(imgs.map((x, n) => supabase.from("files").update({ position: n }).eq("id", x.id)));
    setFiles(await fetchFiles(column, id));
  }

  async function upload(input: FileList | null) {
    const list = input ? await Promise.all(Array.from(input).map(shrink)) : null;
    if (!list?.length) return;
    setBusy(true);
    setError("");
    for (const file of Array.from(list)) {
      if (file.size > MAX) {
        setError(`"${file.name}" גדול מ-25MB`);
        continue;
      }
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
      const path = `${orgId}/${crypto.randomUUID()}${ext}`;
      const up = await supabase.storage.from("files").upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        setError(up.error.message);
        continue;
      }
      await supabase.from("files").insert({ org_id: orgId, [column]: id, name: file.name, path, size: file.size, mime: file.type || null, position: files.length + 1000 });
    }
    setFiles(await fetchFiles(column, id));
    setBusy(false);
  }

  async function open(f: Row) {
    const { data } = await supabase.storage.from("files").createSignedUrl(f.path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(f: Row) {
    if (!(await confirmAction(`למחוק את "${f.name}"?`))) return;
    await supabase.storage.from("files").remove([f.path]);
    await supabase.from("files").delete().eq("id", f.id);
    setFiles((xs) => xs.filter((x) => x.id !== f.id));
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-neutral-500">קבצים {files.length > 0 && <span className="font-normal text-neutral-400">({files.length})</span>}</h2>
        {folderUrl && (
          <a href={folderUrl} target="_blank" rel="noopener" className="text-xs text-tint hover:underline ms-auto me-2">
            📁 תיקיית הלקוח בדרייב ↗
          </a>
        )}
        <label className="text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 cursor-pointer">
          {busy ? "מעלה…" : "+ העלאת קבצים"}
          <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        </label>
      </div>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      {column === "record_id" && files.some(isImg) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {files.filter(isImg).map((f, i, arr) => (
            <div key={f.id} className="group relative aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800">
              {thumbs[f.id] && (
                <button onClick={() => open(f)} className="absolute inset-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbs[f.id]} alt={f.name} className="w-full h-full object-cover" />
                </button>
              )}
              {i === 0 && <span className="absolute top-1 start-1 text-[10px] bg-black/60 text-white rounded px-1.5 py-0.5">שער</span>}
              <div className="absolute bottom-1 inset-x-1 flex justify-between opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex gap-1">
                  <button disabled={i === arr.length - 1} onClick={() => move(f, 1)} className="w-6 h-6 rounded bg-black/60 text-white text-xs disabled:opacity-30" aria-label="הזזה אחורה">‹</button>
                  <button disabled={i === 0} onClick={() => move(f, -1)} className="w-6 h-6 rounded bg-black/60 text-white text-xs disabled:opacity-30" aria-label="הזזה קדימה">›</button>
                </span>
                {contactId &&
                (f.drive_url ? (
                  <a href={f.drive_url} target="_blank" rel="noopener" className="text-xs text-emerald-600 shrink-0 hover:underline" title="נשמר בדרייב">
                    ✓ בדרייב
                  </a>
                ) : (
                  <button onClick={() => toDrive(f)} disabled={driveBusy === f.id} className="text-xs text-neutral-400 hover:text-tint shrink-0 disabled:opacity-50">
                    {driveBusy === f.id ? "מעלה…" : "העלאה לתיקיית הלקוח בדרייב"}
                  </button>
                ))}
              <button onClick={() => remove(f)} className="w-6 h-6 rounded bg-black/60 text-white text-xs" aria-label="מחיקה">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {files.length === 0 ? (
        <p className="text-xs text-neutral-400">אין קבצים.</p>
      ) : (
        <ul className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm divide-y divide-neutral-100 dark:divide-neutral-900">
          {(column === "record_id" ? files.filter((f) => !isImg(f)) : files).map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span>{icon(f.mime, f.name)}</span>
              <button onClick={() => open(f)} className="truncate hover:underline text-start flex-1">
                {f.name}
              </button>
              <span className="text-xs text-neutral-400 shrink-0">
                {f.size ? size(f.size) : ""} · {new Date(f.created_at).toLocaleDateString("he-IL")}
              </span>
              <button onClick={() => remove(f)} className="text-xs text-neutral-300 hover:text-red-500" aria-label="מחיקה">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
