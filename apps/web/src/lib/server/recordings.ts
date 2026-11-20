import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import { loadAiConfig } from "./ai/settings";
import { getSttProvider, transcriptToText, type Segment } from "./ai/stt";
import { summarizeTranscript } from "./ai/summarize";
import { classifyLink, fetchLink } from "./recordingSources";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rec = Record<string, any>;
const BUCKET = "files";
const LOCK_MS = 4 * 60 * 1000;

const ext = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");
const publicRow = (r: Rec): Rec => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { transcript_parts, lock_until, job_ref, ...rest } = r;
  return rest;
};
export { publicRow };

async function patch(id: string, values: Rec): Promise<Rec> {
  const { data, error } = await supabaseAdmin().from("call_recordings").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function createRecording(input: { orgId: string; contactId: string; userId: string; title?: string; url?: string; sourcePath?: string; chunkPaths?: string[]; chunkOffsets?: number[]; }): Promise<Rec> {
  const kind = input.url ? classifyLink(input.url) : "upload";
  const chunks = input.chunkPaths?.length ? input.chunkPaths : [];
  const { data, error } = await supabaseAdmin()
    .from("call_recordings")
    .insert({
      org_id: input.orgId,
      contact_id: input.contactId,
      created_by: input.userId,
      title: input.title?.slice(0, 160) || null,
      source: kind,
      source_url: input.url ?? null,
      source_path: input.sourcePath ?? null,
      chunk_paths: chunks,
      chunk_offsets: input.chunkOffsets ?? chunks.map(() => 0),
      // A link has to be downloaded first; an upload is ready to transcribe.
      status: input.url ? "fetching" : "transcribing",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function signedUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error("הקובץ לא נמצא באחסון");
  return data.signedUrl;
}

// Runs ONE bounded step of the pipeline and returns the updated row. The browser
// calls it in a loop (and the cron resumes anything abandoned), so no single
// request has to survive a whole long recording.
export async function advance(id: string): Promise<Rec> {
  const db = supabaseAdmin();
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  // Take the lock; if someone else holds it, just report the current state.
  const { data: locked } = await db
    .from("call_recordings")
    .update({ lock_until: until })
    .eq("id", id)
    .in("status", ["fetching", "transcribing", "summarizing"])
    .or(`lock_until.is.null,lock_until.lt.${new Date().toISOString()}`)
    .select()
    .maybeSingle();
  if (!locked) return (await db.from("call_recordings").select("*").eq("id", id).single()).data as Rec;
  let rec: Rec = locked;
  try {
    const cfg = await loadAiConfig(rec.org_id);
    if (rec.status === "fetching") rec = await stepFetch(rec, cfg);
    else if (rec.status === "transcribing") rec = await stepTranscribe(rec, cfg);
    else if (rec.status === "summarizing") rec = await stepSummarize(rec, cfg);
  } catch (err) {
    console.error("recording step failed", id, err);
    rec = await patch(id, { status: "failed", error: err instanceof Error ? err.message : "שגיאה לא צפויה" });
  }
  return patch(id, { lock_until: null }).catch(() => rec);
}

async function stepFetch(rec: Rec, cfg: Awaited<ReturnType<typeof loadAiConfig>>): Promise<Rec> {
  const file = await fetchLink(classifyLink(rec.source_url), rec.source_url, cfg);
  const path = `${rec.org_id}/recordings/${rec.id}/source.${ext(file.filename) || "m4a"}`;
  const up = await supabaseAdmin().storage.from(BUCKET).upload(path, file.data, { contentType: file.mime, upsert: true });
  if (up.error) throw new Error(`שמירת הקובץ נכשלה: ${up.error.message}`);
  return routeSource(rec, cfg, path, file.data.length, file.filename);
}

// After the file is stored: transcribe it as is, or ask the browser to cut it into pieces.
async function routeSource(rec: Rec, cfg: Awaited<ReturnType<typeof loadAiConfig>>, path: string, size: number, filename: string): Promise<Rec> {
  const provider = getSttProvider(cfg);
  const fits = size <= provider.maxBytes && provider.extensions.includes(ext(filename));
  if (fits) return patch(rec.id, { source_path: path, chunk_paths: [path], chunk_offsets: [0], status: "transcribing", title: rec.title ?? filename });
  return patch(rec.id, { source_path: path, status: "awaiting_chunks", title: rec.title ?? filename });
}

// The browser cut the file into pieces (≤ the engine's size limit) and uploaded them.
export async function registerChunks(id: string, chunkPaths: string[], chunkOffsets: number[]): Promise<Rec> {
  return patch(id, { chunk_paths: chunkPaths, chunk_offsets: chunkOffsets, chunks_done: 0, transcript_parts: [], job_ref: null, status: "transcribing", error: null });
}

async function stepTranscribe(rec: Rec, cfg: Awaited<ReturnType<typeof loadAiConfig>>): Promise<Rec> {
  const provider = getSttProvider(cfg);
  const paths: string[] = rec.chunk_paths;
  if (!paths.length) throw new Error("אין קובץ לתמלול");
  const i: number = rec.chunks_done;
  if (i >= paths.length) return patch(rec.id, { status: "summarizing" });
  const path = paths[i];
  let result;
  if (rec.job_ref && provider.poll) {
    const p = await provider.poll(rec.job_ref);
    if (p.state === "pending") return rec;
    if (p.state === "failed") throw new Error(p.error);
    result = p.result;
  } else {
    const started = await provider.start({
      url: await signedUrl(path),
      filename: path.split("/").pop() ?? "audio",
      sizeBytes: 0,
      load: async () => {
        const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(path);
        if (error || !data) throw new Error("הורדת הקובץ מהאחסון נכשלה");
        return data;
      },
    });
    if ("jobRef" in started) return patch(rec.id, { job_ref: started.jobRef, provider: provider.id });
    result = started.done;
  }
  const offset: number = rec.chunk_offsets[i] ?? 0;
  const segments: Segment[] = result.segments.map((s) => ({ ...s, start: s.start + offset }));
  const parts = [...(rec.transcript_parts ?? []), { offset, text: result.text, segments }];
  if (rec.job_ref && provider.cleanup) await provider.cleanup(rec.job_ref);
  const done = i + 1;
  return patch(rec.id, {
    transcript_parts: parts,
    chunks_done: done,
    job_ref: null,
    provider: provider.id,
    duration_seconds: (rec.duration_seconds ?? 0) + (result.durationSeconds ?? 0) || null,
    status: done >= paths.length ? "summarizing" : "transcribing",
  });
}

async function stepSummarize(rec: Rec, cfg: Awaited<ReturnType<typeof loadAiConfig>>): Promise<Rec> {
  const db = supabaseAdmin();
  const segments: Segment[] = (rec.transcript_parts ?? []).flatMap((p: Rec) => p.segments ?? []);
  const transcript = rec.transcript || transcriptToText(segments);
  if (!transcript.trim()) throw new Error("התמלול ריק — לא זוהה דיבור בקובץ");
  const { data: contact } = await db.from("contacts").select("name").eq("id", rec.contact_id).maybeSingle();
  const summary = await summarizeTranscript(cfg, transcript, { contactName: contact?.name ?? "הלקוח", title: rec.title ?? undefined });
  // Temp pieces are no longer needed (the original, if stored, stays for playback).
  const temp = (rec.chunk_paths as string[]).filter((p) => p !== rec.source_path);
  if (temp.length) await db.storage.from(BUCKET).remove(temp);
  const out = await patch(rec.id, { transcript, summary, status: "done", error: null, chunk_paths: [] });
  // Show it in the lead's timeline.
  const lines = [`🎙️ סיכום שיחה מוקלטת${rec.title ? ` — ${rec.title}` : ""}`, summary.summary];
  if (summary.decisions.length) lines.push("החלטות:\n" + summary.decisions.map((d) => `• ${d}`).join("\n"));
  if (summary.action_items.length) lines.push("משימות:\n" + summary.action_items.map((a) => `• ${a.task}${a.owner ? ` (${a.owner})` : ""}`).join("\n"));
  await db.from("activities").insert({ org_id: rec.org_id, contact_id: rec.contact_id, type: "note", text: lines.join("\n\n") });
  return out;
}

// Retry a failed recording from the right stage.
export async function retryRecording(id: string): Promise<Rec> {
  const { data } = await supabaseAdmin().from("call_recordings").select("*").eq("id", id).single();
  if (!data || data.status !== "failed") return data as Rec;
  const status = data.transcript ? "summarizing" : data.chunk_paths?.length ? "transcribing" : data.source_path ? "awaiting_chunks" : "fetching";
  return patch(id, { status, error: null, job_ref: null, lock_until: null, ...(status === "transcribing" ? { chunks_done: 0, transcript_parts: [] } : {}) });
}

// Cron: resume recordings nobody is driving (browser closed mid-way).
export async function resumeStuckRecordings(): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("call_recordings")
    .select("id")
    .in("status", ["fetching", "transcribing", "summarizing"])
    .or(`lock_until.is.null,lock_until.lt.${new Date().toISOString()}`)
    .lt("updated_at", new Date(Date.now() - 20_000).toISOString())
    .limit(2);
  for (const r of data ?? []) await advance(r.id);
  return data?.length ?? 0;
}

export { routeSource };
