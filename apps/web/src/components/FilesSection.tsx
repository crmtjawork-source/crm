"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MAX = 25 * 1024 * 1024;
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const icon = (mime = "", name = "") =>
  mime.startsWith("image/") ? "🖼️" : mime.startsWith("video/") ? "🎬" : mime.startsWith("audio/") ? "🎧" : /pdf/.test(mime) || name.endsWith(".pdf") ? "📄" : /sheet|excel|csv/.test(mime) ? "📊" : "📎";

const fetchFiles = async (column: "contact_id" | "record_id", id: string) =>
  (await supabase.from("files").select("*").eq(column, id).order("created_at", { ascending: false })).data ?? [];

// Files on a lead or a record: upload several at once, open, delete.
export function FilesSection({ contactId, recordId }: { contactId?: string; recordId?: string }) {
  const { orgId } = useStore();
  const [files, setFiles] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const column = contactId ? "contact_id" : "record_id";
  const id = (contactId ?? recordId)!;

  useEffect(() => {
    fetchFiles(column, id).then(setFiles);
  }, [column, id]);

  async function upload(list: FileList | null) {
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
      await supabase.from("files").insert({ org_id: orgId, [column]: id, name: file.name, path, size: file.size, mime: file.type || null });
    }
    setFiles(await fetchFiles(column, id));
    setBusy(false);
  }

  async function open(f: Row) {
    const { data } = await supabase.storage.from("files").createSignedUrl(f.path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(f: Row) {
    if (!confirm(`למחוק את "${f.name}"?`)) return;
    await supabase.storage.from("files").remove([f.path]);
    await supabase.from("files").delete().eq("id", f.id);
    setFiles((xs) => xs.filter((x) => x.id !== f.id));
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-neutral-500">קבצים {files.length > 0 && <span className="font-normal text-neutral-400">({files.length})</span>}</h2>
        <label className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 cursor-pointer">
          {busy ? "מעלה…" : "+ העלאת קבצים"}
          <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        </label>
      </div>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      {files.length === 0 ? (
        <p className="text-xs text-neutral-400">אין קבצים.</p>
      ) : (
        <ul className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-900">
          {files.map((f) => (
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
