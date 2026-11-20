import "server-only";
import type { AiConfig } from "./settings";

export type Segment = { speaker?: string; text: string; start: number };
export type SttResult = { text: string; segments: Segment[]; durationSeconds?: number };

// What a provider gets: a short-lived URL of the file, plus (for providers that
// need the bytes) a loader. `sizeBytes`/`filename` let it refuse unsuitable input.
export type SttInput = { url: string; filename: string; sizeBytes: number; load: () => Promise<Blob> };

export type SttPoll = { state: "pending" } | { state: "done"; result: SttResult } | { state: "failed"; error: string };

// A speech-to-text engine. Two shapes behind one interface:
//  - "sync" engines (OpenAI-compatible) transcribe a piece inside `start` and return the result at once;
//  - "job" engines (Soniox) return a job ref and are polled — no request has to stay open for long files.
// `maxBytes` is the largest piece the engine accepts; bigger files are cut in the browser first.
export interface SttProvider {
  id: string;
  label: string;
  maxBytes: number;
  extensions: string[];
  start(input: SttInput): Promise<{ done: SttResult } | { jobRef: string }>;
  poll?(jobRef: string): Promise<SttPoll>;
  cleanup?(jobRef: string): Promise<void>;
}

const AUDIO_EXT = ["mp3", "mp4", "m4a", "wav", "webm", "ogg", "flac", "aac", "amr", "aiff", "mpeg", "mpga", "mov"];

// ---- Soniox (async, long files up to 300 min, Hebrew + speaker labels) ----
function soniox(apiKey: string, model: string): SttProvider {
  const base = "https://api.soniox.com/v1";
  const headers = { Authorization: `Bearer ${apiKey}` };
  return {
    id: "soniox",
    label: "Soniox",
    maxBytes: 1024 * 1024 * 1024,
    extensions: ["aac", "aiff", "amr", "flac", "mp3", "ogg", "wav", "webm", "m4a", "mp4"],
    async start(input) {
      const res = await fetch(`${base}/transcriptions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model, audio_url: input.url, language_hints: ["he", "en"], enable_speaker_diarization: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.id) throw new Error(`Soniox: ${json.error_message ?? json.message ?? res.status}`);
      return { jobRef: json.id as string };
    },
    async poll(jobRef) {
      const res = await fetch(`${base}/transcriptions/${jobRef}`, { headers });
      const job = await res.json().catch(() => ({}));
      if (!res.ok) return { state: "failed", error: `Soniox: ${job.error_message ?? res.status}` };
      if (job.status === "error") return { state: "failed", error: `Soniox: ${job.error_message ?? job.error_type ?? "שגיאה"}` };
      if (job.status !== "completed") return { state: "pending" };
      const tr = await fetch(`${base}/transcriptions/${jobRef}/transcript`, { headers });
      const body = await tr.json().catch(() => ({}));
      if (!tr.ok) return { state: "failed", error: `Soniox: ${body.error_message ?? tr.status}` };
      return { state: "done", result: { ...sonioxToSegments(body.tokens ?? []), durationSeconds: job.audio_duration_ms ? Math.round(job.audio_duration_ms / 1000) : undefined } };
    },
    async cleanup(jobRef) {
      await fetch(`${base}/transcriptions/${jobRef}`, { method: "DELETE", headers }).catch(() => {});
    },
  };
}

// Tokens → one segment per speaker turn. Tokens carry their own spacing.
export function sonioxToSegments(tokens: Array<{ text: string; start_ms?: number; speaker?: string | number }>): { text: string; segments: Segment[] } {
  const segments: Segment[] = [];
  for (const t of tokens) {
    const speaker = t.speaker != null ? String(t.speaker) : undefined;
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) last.text += t.text;
    else segments.push({ speaker, text: t.text, start: Math.round((t.start_ms ?? 0) / 1000) });
  }
  for (const s of segments) s.text = s.text.trim();
  const clean = segments.filter((s) => s.text);
  return { text: clean.map((s) => s.text).join("\n"), segments: clean };
}

// ---- OpenAI-compatible /audio/transcriptions (OpenAI, Groq, a self-hosted ivrit-ai server…) ----
function openaiCompatible(id: string, label: string, baseUrl: string, apiKey: string, model: string): SttProvider {
  return {
    id,
    label,
    maxBytes: 24 * 1024 * 1024,
    extensions: ["mp3", "mp4", "m4a", "wav", "webm", "ogg", "flac", "mpeg", "mpga"],
    async start(input) {
      const blob = await input.load();
      const form = new FormData();
      form.append("file", blob, input.filename);
      form.append("model", model);
      form.append("language", "he");
      // whisper-style models can return timestamps; the gpt-4o ones only plain json.
      const verbose = /whisper/i.test(model);
      form.append("response_format", verbose ? "verbose_json" : "json");
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${label}: ${json.error?.message ?? json.error ?? res.status}`);
      const segs: Segment[] = Array.isArray(json.segments) ? json.segments.map((s: { text: string; start: number }) => ({ text: String(s.text).trim(), start: Math.round(s.start) })) : [];
      const text = String(json.text ?? "").trim();
      return { done: { text, segments: segs.length ? segs : text ? [{ text, start: 0 }] : [], durationSeconds: json.duration ? Math.round(json.duration) : undefined } };
    },
  };
}

// ---- Mock: fixed Hebrew text, for testing the whole flow without keys or cost ----
function mock(): SttProvider {
  return {
    id: "mock",
    label: "בדיקה (ללא תמלול אמיתי)",
    maxBytes: 1024 * 1024 * 1024,
    extensions: AUDIO_EXT,
    async start(input) {
      const segments: Segment[] = [
        { speaker: "1", start: 0, text: `שלום, מדבר הסוכן. זו שיחת בדיקה שנוצרה ללא תמלול אמיתי (קובץ: ${input.filename}).` },
        { speaker: "2", start: 8, text: "היי, אני מעוניין בדירת 4 חדרים באזור המרכז, תקציב עד 2.5 מיליון שקל." },
        { speaker: "1", start: 15, text: "מצוין. אשלח לך שלוש אפשרויות עד יום חמישי, ונקבע פגישת צפייה ביום ראשון בבוקר." },
        { speaker: "2", start: 24, text: "סגור. תשלח לי גם את פרטי המשכנתא שדיברנו עליהם." },
      ];
      return { done: { text: segments.map((s) => s.text).join("\n"), segments, durationSeconds: 30 } };
    },
  };
}

export function getSttProvider(cfg: AiConfig): SttProvider {
  const key = cfg.sttApiKey;
  switch (cfg.sttProvider) {
    case "mock":
      return mock();
    case "soniox":
      if (!key) throw new Error("חסר מפתח Soniox — מגדירים בהגדרות ← תמלול ו-AI");
      return soniox(key, cfg.sttModel || "stt-async-v6");
    case "openai":
      if (!key) throw new Error("חסר מפתח OpenAI — מגדירים בהגדרות ← תמלול ו-AI");
      return openaiCompatible("openai", "OpenAI", "https://api.openai.com/v1", key, cfg.sttModel || "gpt-4o-transcribe");
    case "groq":
      if (!key) throw new Error("חסר מפתח Groq — מגדירים בהגדרות ← תמלול ו-AI");
      return openaiCompatible("groq", "Groq", "https://api.groq.com/openai/v1", key, cfg.sttModel || "whisper-large-v3");
    case "custom":
      if (!key || !cfg.sttBaseUrl) throw new Error("חסרה כתובת או מפתח לשרת התמלול המותאם");
      return openaiCompatible("custom", "שרת מותאם", cfg.sttBaseUrl, key, cfg.sttModel || "whisper-1");
    default:
      throw new Error("לא הוגדר מנוע תמלול — מגדירים בהגדרות ← תמלול ו-AI");
  }
}

export function transcriptToText(segments: Segment[]): string {
  const multi = new Set(segments.map((s) => s.speaker).filter(Boolean)).size > 1;
  return segments.map((s) => (multi && s.speaker ? `דובר ${s.speaker}: ${s.text}` : s.text)).join("\n");
}
