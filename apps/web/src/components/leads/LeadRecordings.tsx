"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";
import { cutIntoChunks } from "@/lib/audioChunks";
import type { Contact } from "@/lib/types";
import { WhatsAppSheet } from "./WhatsAppSheet";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;
const ACTIVE = ["fetching", "transcribing", "summarizing"];
const DIRECT_MAX = 45 * 1024 * 1024; // above this the browser cuts the file instead of uploading it whole
const STATUS_TEXT: Record<string, string> = { fetching: "מוריד את ההקלטה…", awaiting_chunks: "מכין את הקובץ לתמלול…", transcribing: "מתמלל…", summarizing: "מסכם…", failed: "נכשל" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ext = (n: string) => (n.includes(".") ? n.slice(n.lastIndexOf(".")).toLowerCase().replace(/[^.a-z0-9]/g, "") : "");

// Formats the summary as a message to the client (plain text, ready to edit).
export function clientMessageFor(rec: Rec, name: string): string {
  const s = rec.summary ?? {};
  if (s.client_message) return s.client_message;
  const lines = [`היי ${name.split(" ")[0]}, תודה על השיחה. תמצית:`, s.summary ?? ""];
  if (s.decisions?.length) lines.push("מה סוכם:\n" + s.decisions.map((d: string) => `• ${d}`).join("\n"));
  if (s.action_items?.length) lines.push("הצעדים הבאים:\n" + s.action_items.map((a: Rec) => `• ${a.task}`).join("\n"));
  return lines.filter(Boolean).join("\n\n");
}

// "שיחה מוקלטת": paste a Zoom / Drive link or upload a recording → transcript + AI summary on the lead.
export function LeadRecordings({ contact }: { contact: Contact }) {
  const { orgId, loadActivitiesFor } = useStore();
  const [recs, setRecs] = useState<Rec[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [sendText, setSendText] = useState<string | null>(null);
  const driving = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const upsert = useCallback((r: Rec) => setRecs((xs) => (xs.some((x) => x.id === r.id) ? xs.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [r, ...xs])), []);

  // Cut a stored (big) original into pieces in the browser and hand them back to the server.
  const cutAndRegister = useCallback(
    async (rec: Rec, blob: Blob) => {
      const pieces = await cutIntoChunks(blob, (d, t) => setBusy(`חותך את הקובץ… ${d}/${t}`));
      const paths: string[] = [];
      for (const [i, p] of pieces.entries()) {
        const path = `${orgId}/recordings/${rec.id ?? crypto.randomUUID()}/part-${i}.wav`;
        setBusy(`מעלה חלק ${i + 1}/${pieces.length}…`);
        const up = await supabase.storage.from("files").upload(path, p.blob, { contentType: "audio/wav", upsert: true });
        if (up.error) throw new Error(up.error.message);
        paths.push(path);
      }
      return { paths, offsets: pieces.map((p) => p.offset) };
    },
    [orgId]
  );

  // Drives one recording to the end: one server step at a time, until done or failed.
  const drive = useCallback(
    async (start: Rec) => {
      if (driving.current.has(start.id)) return;
      driving.current.add(start.id);
      let rec = start;
      try {
        while (alive.current && (ACTIVE.includes(rec.status) || rec.status === "awaiting_chunks")) {
          if (rec.status === "awaiting_chunks") {
            if (!rec.source_path) break;
            const { data } = await supabase.storage.from("files").createSignedUrl(rec.source_path, 600);
            const blob = await (await fetch(data!.signedUrl)).blob();
            const { paths, offsets } = await cutAndRegister(rec, blob);
            setBusy("");
            rec = (await apiPost<{ recording: Rec }>(`/api/recordings/${rec.id}/step`, { chunkPaths: paths, chunkOffsets: offsets })).recording;
          } else {
            rec = (await apiPost<{ recording: Rec }>(`/api/recordings/${rec.id}/step`, {})).recording;
            // A remote engine is still working: wait before asking again.
            if (ACTIVE.includes(rec.status)) await sleep(rec.status === "transcribing" ? 3000 : 800);
          }
          upsert(rec);
        }
      } catch (err) {
        setBusy("");
        setError(err instanceof Error ? err.message : "העיבוד נכשל");
      } finally {
        driving.current.delete(start.id);
        if (rec.status === "done") loadActivitiesFor(contact.id);
      }
    },
    [cutAndRegister, upsert, loadActivitiesFor, contact.id]
  );

  useEffect(() => {
    supabase
      .from("call_recordings")
      .select("*")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = data ?? [];
        setRecs(rows);
        rows.filter((r) => ACTIVE.includes(r.status) || r.status === "awaiting_chunks").forEach((r) => drive(r));
      });
  }, [contact.id, drive]);

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy("שולח…");
    setError("");
    try {
      const { recording } = await apiPost<{ recording: Rec }>("/api/recordings", { contactId: contact.id, url: url.trim() });
      setUrl("");
      upsert(recording);
      setBusy("");
      drive(recording);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הוספת הקישור נכשלה");
      setBusy("");
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      let body: Rec;
      if (file.size <= DIRECT_MAX) {
        setBusy("מעלה…");
        const path = `${orgId}/recordings/${crypto.randomUUID()}/source${ext(file.name)}`;
        const up = await supabase.storage.from("files").upload(path, file, { contentType: file.type || undefined });
        if (up.error) throw new Error(up.error.message);
        body = { sourcePath: path, fileName: file.name, size: file.size };
      } else {
        // Too big to store whole: cut here, upload only the pieces.
        const { paths, offsets } = await cutAndRegister({}, file);
        body = { chunkPaths: paths, chunkOffsets: offsets };
      }
      const { recording } = await apiPost<{ recording: Rec }>("/api/recordings", { contactId: contact.id, title: file.name.replace(/\.[^.]+$/, ""), ...body });
      upsert(recording);
      setBusy("");
      drive(recording);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההעלאה נכשלה");
      setBusy("");
    }
  }

  async function retry(r: Rec) {
    setError("");
    const { recording } = await apiPost<{ recording: Rec }>(`/api/recordings/${r.id}/retry`, {});
    upsert(recording);
    drive(recording);
  }

  async function remove(r: Rec) {
    if (!(await confirmAction("למחוק את ההקלטה והתמלול?"))) return;
    const paths = [r.source_path, ...(r.chunk_paths ?? [])].filter(Boolean);
    if (paths.length) await supabase.storage.from("files").remove(paths);
    await supabase.from("call_recordings").delete().eq("id", r.id);
    setRecs((xs) => xs.filter((x) => x.id !== r.id));
  }

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-neutral-500 mb-2">שיחה מוקלטת {recs.length > 0 && <span className="font-normal text-neutral-400">({recs.length})</span>}</h2>
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm p-3 space-y-2">
        <form onSubmit={addLink} className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" placeholder="קישור להקלטת זום / גוגל דרייב" className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent" />
          <button disabled={!!busy || !url.trim()} className="px-3 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm disabled:opacity-50">
            תמלול וסיכום
          </button>
        </form>
        <label className="inline-block text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 cursor-pointer">
          או העלאת קובץ שמע / וידאו
          <input type="file" accept="audio/*,video/*,.m4a,.mp3,.mp4,.wav,.webm,.ogg" className="hidden" disabled={!!busy} onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
        </label>
        {busy && <p className="text-xs text-neutral-500">{busy}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <ul className="mt-2 space-y-1.5">
        {recs.map((r) => {
          const s = r.summary;
          const active = ACTIVE.includes(r.status) || r.status === "awaiting_chunks";
          const total = (r.chunk_paths ?? []).length;
          return (
            <li key={r.id} className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm text-sm">
              <div className="flex items-center gap-2 px-3 py-2">
                <span>🎙️</span>
                <button onClick={() => r.status === "done" && setOpen(open === r.id ? null : r.id)} className="truncate text-start flex-1">
                  {r.title || (r.source_url ? new URL(r.source_url).host : "הקלטה")}
                </button>
                <span className="text-xs text-neutral-400 shrink-0">{new Date(r.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
                <button onClick={() => remove(r)} className="text-xs text-neutral-300 hover:text-red-500" aria-label="מחיקה">
                  ×
                </button>
              </div>
              {active && (
                <div className="px-3 pb-3">
                  <div className="h-1.5 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: r.status === "summarizing" ? "92%" : r.status === "transcribing" ? `${Math.max(10, total ? (r.chunks_done / total) * 80 + 10 : 15)}%` : "6%" }} />
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    {STATUS_TEXT[r.status]} {r.status === "transcribing" && total > 1 && `(חלק ${Math.min(r.chunks_done + 1, total)}/${total})`}
                  </p>
                </div>
              )}
              {r.status === "failed" && (
                <div className="px-3 pb-3 text-xs space-y-1">
                  <p className="text-red-500">{r.error || "העיבוד נכשל"}</p>
                  <button onClick={() => retry(r)} className="underline text-neutral-600 dark:text-neutral-300">
                    ניסיון חוזר
                  </button>
                </div>
              )}
              {r.status === "done" && s && (
                <div className="px-3 pb-3 space-y-2">
                  <p className={`text-xs leading-relaxed ${open === r.id ? "" : "line-clamp-2"}`}>🧠 {s.summary}</p>
                  {open === r.id && (
                    <div className="space-y-2 text-xs">
                      {s.decisions?.length > 0 && (
                        <div>
                          <p className="font-semibold text-neutral-500">החלטות</p>
                          <ul className="list-disc ps-4">{s.decisions.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul>
                        </div>
                      )}
                      {s.action_items?.length > 0 && (
                        <div>
                          <p className="font-semibold text-neutral-500">משימות להמשך</p>
                          <ul className="list-disc ps-4">{s.action_items.map((a: Rec, i: number) => <li key={i}>{a.task}{a.owner ? ` — ${a.owner}` : ""}</li>)}</ul>
                        </div>
                      )}
                      <details>
                        <summary className="cursor-pointer text-neutral-500">תמלול מלא</summary>
                        <pre className="whitespace-pre-wrap font-sans mt-1 max-h-64 overflow-y-auto leading-relaxed" dir="auto">{r.transcript}</pre>
                      </details>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSendText(clientMessageFor(r, contact.name))} disabled={!contact.phone} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-40">
                      שליחה ללקוח בוואטסאפ
                    </button>
                    {contact.email && (
                      <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`סיכום השיחה שלנו${r.title ? ` — ${r.title}` : ""}`)}&body=${encodeURIComponent(clientMessageFor(r, contact.name))}`} className="text-xs px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800">
                        שליחה במייל
                      </a>
                    )}
                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-xs px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800">
                      {open === r.id ? "סגירה" : "פירוט ותמלול"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sendText !== null && <WhatsAppSheet contact={contact} initialText={sendText} onClose={() => setSendText(null)} />}
    </section>
  );
}
