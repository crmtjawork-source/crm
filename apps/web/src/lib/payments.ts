// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type PaymentItem = {
  id: string;
  scheduleId: string;
  contactId: string;
  description: string;
  amount: number | null;
  dueDate: string | null;
  condition: string | null;
  paid: boolean;
  paidAt: string | null;
  position: number;
};
export type PaymentSchedule = {
  id: string;
  contactId: string;
  opportunityId: string | null;
  fileId: string | null;
  title: string;
  summary: string | null;
  totalAmount: number | null;
  currency: string;
  status: "active" | "completed" | "cancelled";
  aiExtracted: boolean;
  createdAt: string;
  items: PaymentItem[];
};

export const mapItem = (r: Row): PaymentItem => ({
  id: r.id,
  scheduleId: r.schedule_id,
  contactId: r.contact_id,
  description: r.description,
  amount: r.amount == null ? null : Number(r.amount),
  dueDate: r.due_date ?? null,
  condition: r.condition_text ?? null,
  paid: Boolean(r.paid),
  paidAt: r.paid_at ?? null,
  position: r.position ?? 0,
});
export const mapSchedule = (r: Row, items: PaymentItem[]): PaymentSchedule => ({
  id: r.id,
  contactId: r.contact_id,
  opportunityId: r.opportunity_id ?? null,
  fileId: r.file_id ?? null,
  title: r.title,
  summary: r.summary ?? null,
  totalAmount: r.total_amount == null ? null : Number(r.total_amount),
  currency: r.currency ?? "ILS",
  status: r.status,
  aiExtracted: Boolean(r.ai_extracted),
  createdAt: r.created_at,
  items: items.filter((i) => i.scheduleId === r.id).sort((a, b) => a.position - b.position),
});

export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const symbol = (c: string) => (c === "ILS" ? "₪" : c === "USD" ? "$" : c === "EUR" ? "€" : c);
export const fmtMoney = (n: number | null | undefined, cur = "ILS") => (n == null ? "—" : `${n.toLocaleString("he-IL")} ${symbol(cur)}`);
export const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export type ItemState = "paid" | "overdue" | "soon" | "upcoming" | "undated";
export function itemState(i: PaymentItem, today = localDay(), soonDays = 14): ItemState {
  if (i.paid) return "paid";
  if (!i.dueDate) return "undated";
  if (i.dueDate < today) return "overdue";
  const limit = new Date();
  limit.setDate(limit.getDate() + soonDays);
  return i.dueDate <= localDay(limit) ? "soon" : "upcoming";
}
export const STATE_LABEL: Record<ItemState, string> = { paid: "שולם", overdue: "באיחור", soon: "בקרוב", upcoming: "עתידי", undated: "ללא תאריך" };
export const STATE_CLASS: Record<ItemState, string> = {
  paid: "bg-emerald-500/15 text-emerald-600",
  overdue: "bg-red-500/15 text-red-600",
  soon: "bg-amber-500/15 text-amber-600",
  upcoming: "bg-sky-500/15 text-sky-600",
  undated: "bg-neutral-500/15 text-neutral-500",
};

export const sumAmounts = (items: PaymentItem[]) => items.reduce((s, i) => s + (i.amount ?? 0), 0);
