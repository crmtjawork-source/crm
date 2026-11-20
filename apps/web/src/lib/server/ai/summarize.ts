import "server-only";
import type { AiConfig } from "./settings";
import { env } from "../env";

export type RecordingSummary = {
  summary: string;
  decisions: string[];
  action_items: Array<{ task: string; owner?: string }>;
  client_message: string;
};

const SYSTEM = `אתה עוזר למנהל מכירות/סוכן. מקבל תמלול של שיחה (או פגישה) עם לקוח, בעברית, לעיתים עם שגיאות תמלול.
החזר JSON בלבד, בלי טקסט נוסף ובלי בלוק קוד, במבנה:
{"summary": "סיכום תמציתי של השיחה ב-3 עד 6 משפטים",
 "decisions": ["החלטה או הסכמה שהושגה"],
 "action_items": [{"task": "משימה ברורה", "owner": "מי אחראי: הסוכן / הלקוח / שם"}],
 "client_message": "הודעת סיכום קצרה וחמה ללקוח, בגוף ראשון של הסוכן, מוכנה לשליחה בוואטסאפ: תודה על השיחה, מה סוכם, מה הצעדים הבאים ומתי"}
כתוב בעברית. אל תמציא עובדות, מספרים או התחייבויות שלא נאמרו בתמלול. אם משהו לא ברור, השמט אותו. אם אין החלטות או משימות, החזר מערך ריק.`;

async function ask(cfg: AiConfig, system: string, user: string, maxTokens: number): Promise<string> {
  if (!cfg.llmApiKey) throw new Error("חסר מפתח Anthropic לסיכום — מגדירים בהגדרות ← תמלול ו-AI");
  const res = await fetch(`${env.anthropicBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": cfg.llmApiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.llmModel, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude: ${json.error?.message ?? res.status}`);
  return (json.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
}

export function parseSummary(raw: string): RecordingSummary {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  let o: Partial<RecordingSummary> = {};
  try {
    o = JSON.parse(raw.slice(start, end + 1));
  } catch {
    // The model answered in prose: keep it as the summary rather than losing it.
    return { summary: raw.trim(), decisions: [], action_items: [], client_message: "" };
  }
  const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    summary: String(o.summary ?? "").trim(),
    decisions: strs(o.decisions),
    action_items: Array.isArray(o.action_items)
      ? o.action_items.map((a) => ({ task: String((a as { task?: string }).task ?? "").trim(), owner: (a as { owner?: string }).owner ? String((a as { owner?: string }).owner) : undefined })).filter((a) => a.task)
      : [],
    client_message: String(o.client_message ?? "").trim(),
  };
}

const PART = 90_000; // characters; a one-hour Hebrew call is ~60k, so this is only for very long meetings

export async function summarizeTranscript(cfg: AiConfig, transcript: string, context: { contactName: string; title?: string }): Promise<RecordingSummary> {
  const head = `שם הלקוח: ${context.contactName}${context.title ? `\nנושא: ${context.title}` : ""}\n\nתמלול:\n`;
  if (transcript.length <= PART) return parseSummary(await ask(cfg, SYSTEM, head + transcript, 2000));
  // Very long: summarise each part, then merge the partial summaries.
  const parts: string[] = [];
  for (let i = 0; i < transcript.length; i += PART) parts.push(transcript.slice(i, i + PART));
  const partial: string[] = [];
  for (const [i, p] of parts.entries()) partial.push(`חלק ${i + 1}:\n` + (await ask(cfg, "סכם בעברית, בפירוט, את החלק הזה משיחה: נושאים, החלטות, משימות, מספרים. בלי להמציא.", p, 1500)));
  return parseSummary(await ask(cfg, SYSTEM, `${head}(התמלול ארוך; להלן סיכומי החלקים)\n${partial.join("\n\n")}`, 2000));
}
