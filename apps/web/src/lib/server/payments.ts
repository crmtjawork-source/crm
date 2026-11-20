import "server-only";
import type { Db } from "./supabaseAdmin";
import { env } from "./env";
import { HttpError } from "./auth";
import { triggerAutomations } from "./automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type ExtractedItem = { description: string; amount: number | null; dueDate: string | null; condition: string | null };
export type Extraction = { title: string; summary: string; totalAmount: number | null; currency: string; items: ExtractedItem[]; warnings: string[] };

const TOOL = {
  name: "record_payment_schedule",
  description: "Records the payment schedule found in a purchase / sale / service contract.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title for the deal, e.g. the property or project and parties (Hebrew)." },
      summary: { type: "string", description: "2-4 sentence summary of the contract's payment terms (Hebrew)." },
      totalAmount: { type: ["number", "null"], description: "Total contract price, a plain number. null if not stated." },
      currency: { type: "string", description: "ISO code: ILS, USD, EUR…" },
      items: {
        type: "array",
        description: "Every payment the buyer/client must make, in chronological order.",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "What the payment is for (e.g. advance, 2nd instalment, balance on delivery), Hebrew." },
            amount: { type: ["number", "null"], description: "Amount as a plain number; if only a percentage is given and the total is known, compute it." },
            dueDate: { type: ["string", "null"], description: "YYYY-MM-DD when the contract gives a concrete date, else null." },
            condition: { type: ["string", "null"], description: "When the due date is not a concrete date (e.g. 'on handover', '14 days after signing'), the rule quoted briefly in Hebrew." },
          },
          required: ["description", "amount", "dueDate", "condition"],
        },
      },
      warnings: { type: "array", items: { type: "string" }, description: "Anything unclear, missing or ambiguous that a human must double-check (Hebrew)." },
    },
    required: ["title", "summary", "totalAmount", "currency", "items", "warnings"],
  },
} as const;

const PROMPT = `אתה עוזר שקורא חוזה (רכישת דירה / מכר / שירות) ומחלץ ממנו את לוח התשלומים.
- החזר את כל התשלומים שהלקוח חייב לשלם, לפי הסדר, דרך הכלי record_payment_schedule.
- תאריך (dueDate) רק אם החוזה מציין תאריך מפורש. אם התשלום מותנה באירוע או בפרק זמן ("ב-14 יום מהחתימה", "במסירה") - dueDate=null וציין את הכלל ב-condition.
- אל תמציא סכומים או תאריכים. מה שלא ברור - null, והוסף אזהרה ב-warnings.
- אם התשלום מצוין באחוזים וידוע המחיר הכולל - חשב את הסכום.
- טקסט בעברית. תאריכים בפורמט YYYY-MM-DD (בחוזה הם כנראה כתובים dd/mm/yyyy).`;

export const EXTRACT_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];

export async function extractPaymentSchedule(bytes: Uint8Array, mime: string): Promise<Extraction> {
  const key = env.anthropicApiKey();
  if (!key) throw new HttpError(503, "קריאת חוזים עם AI עדיין לא הופעלה (חסר מפתח ANTHROPIC_API_KEY בשרת). אפשר למלא את לוח התשלומים ידנית.");
  if (!EXTRACT_MIME.includes(mime)) throw new HttpError(415, "אפשר לקרוא PDF או תמונה (JPG / PNG)");
  const data = Buffer.from(bytes).toString("base64");
  const block = mime === "application/pdf" ? { type: "document", source: { type: "base64", media_type: mime, data } } : { type: "image", source: { type: "base64", media_type: mime, data } };
  const res = await fetch(`${env.anthropicBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env.anthropicModel(),
      max_tokens: 4096,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("anthropic extract failed", res.status, text.slice(0, 500));
    throw new HttpError(502, res.status === 401 ? "מפתח ה-AI לא תקין" : "קריאת החוזה נכשלה — אפשר לנסות שוב או למלא ידנית");
  }
  const json = (await res.json()) as { content?: Row[] };
  const input = json.content?.find((b) => b.type === "tool_use")?.input as Row | undefined;
  if (!input) throw new HttpError(502, "ה-AI לא החזיר לוח תשלומים");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    title: String(input.title ?? "").slice(0, 200),
    summary: String(input.summary ?? "").slice(0, 2000),
    totalAmount: num(input.totalAmount),
    currency: String(input.currency || "ILS").slice(0, 8),
    items: (Array.isArray(input.items) ? input.items : []).slice(0, 100).map((i: Row) => ({
      description: String(i.description ?? "").slice(0, 300),
      amount: num(i.amount),
      dueDate: date(i.dueDate),
      condition: i.condition ? String(i.condition).slice(0, 300) : null,
    })),
    warnings: (Array.isArray(input.warnings) ? input.warnings : []).map((w: unknown) => String(w).slice(0, 300)).slice(0, 20),
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const money = (n: number | null, cur: string) => (n == null ? "" : `${n.toLocaleString("he-IL")} ${cur === "ILS" ? "₪" : cur}`);

// Rebuilds the reminders of one payment: a task + a due reminder N days before the due date.
// Reminders in the past are skipped. Paid / dateless items get none. Safe to call repeatedly.
export async function syncItemReminders(db: Db, itemId: string): Promise<void> {
  const { data: item } = await db.from("payment_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return;
  const [{ data: org }, { data: schedule }, { data: contact }, { data: old }] = await Promise.all([
    db.from("organizations").select("payment_reminder_days, payment_create_tasks").eq("id", item.org_id).single(),
    db.from("payment_schedules").select("title, currency, status").eq("id", item.schedule_id).single(),
    db.from("contacts").select("name, owner_email").eq("id", item.contact_id).single(),
    db.from("payment_reminders").select("id, task_id").eq("item_id", itemId),
  ]);
  // Drop the previous reminders and their (still open) tasks; they're rebuilt below.
  const oldTasks = (old ?? []).map((r: Row) => r.task_id).filter(Boolean);
  if (oldTasks.length) await db.from("tasks").delete().in("id", oldTasks).eq("done", false);
  await db.from("payment_reminders").delete().eq("item_id", itemId);
  if (item.paid || !item.due_date || schedule?.status !== "active") return;

  let assignee: string | null = null;
  if (contact?.owner_email) {
    const { data: u } = await db.from("users").select("full_name").ilike("email", contact.owner_email).maybeSingle();
    assignee = u?.full_name ?? null;
  }
  const days = [...new Set(((org?.payment_reminder_days ?? [7, 1]) as number[]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365))].sort((a, b) => b - a);
  for (const n of days) {
    const remindOn = shift(item.due_date, n);
    if (remindOn < today()) continue;
    let taskId: string | null = null;
    if (org?.payment_create_tasks !== false) {
      const label = `${item.description}${item.amount != null ? ` ${money(item.amount, schedule?.currency ?? "ILS")}` : ""}`;
      const { data: task } = await db
        .from("tasks")
        .insert({
          org_id: item.org_id,
          contact_id: item.contact_id,
          title: `תזכורת תשלום: ${contact?.name ?? ""} — ${label} (${n === 0 ? "היום" : `בעוד ${n} ימים`}, ${item.due_date.split("-").reverse().join("/")})`,
          due_date: remindOn,
          assignee,
        })
        .select("id")
        .single();
      taskId = task?.id ?? null;
    }
    await db.from("payment_reminders").insert({ org_id: item.org_id, item_id: itemId, days_before: n, remind_on: remindOn, task_id: taskId });
  }
}

export async function syncScheduleReminders(db: Db, scheduleId: string): Promise<void> {
  const { data } = await db.from("payment_items").select("id").eq("schedule_id", scheduleId);
  for (const i of data ?? []) await syncItemReminders(db, i.id);
}

// Cron: reminders whose day arrived → bell notification (to the lead's owner + admins) and the
// "payment_due" automation trigger. Reminders of paid items are just closed.
export async function processPaymentReminders(db: Db): Promise<number> {
  const { data: due } = await db.from("payment_reminders").select("*").is("notified_at", null).lte("remind_on", today()).limit(100);
  let sent = 0;
  for (const r of due ?? []) {
    const { data: claimed } = await db.from("payment_reminders").update({ notified_at: new Date().toISOString() }).eq("id", r.id).is("notified_at", null).select("id");
    if (!claimed?.length) continue;
    const { data: item } = await db.from("payment_items").select("*").eq("id", r.item_id).maybeSingle();
    if (!item || item.paid || !item.due_date) continue;
    const [{ data: contact }, { data: schedule }] = await Promise.all([
      db.from("contacts").select("name, owner_email").eq("id", item.contact_id).single(),
      db.from("payment_schedules").select("currency, status").eq("id", item.schedule_id).single(),
    ]);
    if (schedule?.status !== "active") continue;
    const when = r.days_before === 0 ? "היום" : `בעוד ${r.days_before} ימים`;
    const amount = money(item.amount, schedule?.currency ?? "ILS");
    await db.from("notifications").insert({
      org_id: item.org_id,
      contact_id: item.contact_id,
      text: `💰 תשלום ${when}: ${contact?.name ?? ""} — ${item.description}${amount ? ` (${amount})` : ""}`,
      target_email: contact?.owner_email ?? null,
      url: "/payments",
    });
    await triggerAutomations(db, item.org_id, "payment_due", item.contact_id, {
      value: String(r.days_before),
      vars: {
        payment_description: item.description,
        payment_amount: amount,
        payment_date: item.due_date.split("-").reverse().join("/"),
        payment_days: String(r.days_before),
      },
    }).catch((err) => console.error("payment_due automation failed", err));
    sent++;
  }
  return sent;
}
