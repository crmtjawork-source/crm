"use client";

import { useState } from "react";
import Link from "next/link";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/lib/supabaseClient";
import { ApiError, apiPost } from "@/lib/api";
import { fmtDate, fmtMoney, itemState, STATE_CLASS, STATE_LABEL, sumAmounts, type PaymentItem, type PaymentSchedule } from "@/lib/payments";
import { useStore } from "@/lib/store";

async function call(method: string, path: string, body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `שגיאה ${res.status}`, res.status);
}
const input = "px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm";

export function ScheduleCard({ schedule, onChange, showClient = true }: { schedule: PaymentSchedule; onChange: () => void; showClient?: boolean }) {
  const { contacts, opportunities } = useStore();
  const contact = contacts.find((c) => c.id === schedule.contactId);
  const deal = opportunities.find((o) => o.id === schedule.opportunityId);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ description: "", amount: "", dueDate: "", condition: "" });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const total = schedule.totalAmount ?? sumAmounts(schedule.items);
  const paid = sumAmounts(schedule.items.filter((i) => i.paid));
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "הפעולה נכשלה");
    }
  }
  async function openContract() {
    if (!schedule.fileId) return;
    const { data: f } = await supabase.from("files").select("path").eq("id", schedule.fileId).maybeSingle();
    if (!f) return;
    const { data } = await supabase.storage.from("files").createSignedUrl(f.path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
  function startEdit(i: PaymentItem) {
    setEditing(i.id);
    setAdding(false);
    setDraft({ description: i.description, amount: i.amount == null ? "" : String(i.amount), dueDate: i.dueDate ?? "", condition: i.condition ?? "" });
  }
  const payload = () => ({ description: draft.description, amount: draft.amount === "" ? null : Number(draft.amount), dueDate: draft.dueDate || null, condition: draft.condition || null });

  return (
    <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">
            {showClient && contact ? (
              <Link href={`/contacts/${contact.id}`} className="hover:underline">{contact.name}</Link>
            ) : (
              schedule.title
            )}
            {schedule.status !== "active" && <span className={`ms-2 text-xs px-1.5 py-0.5 rounded-full ${schedule.status === "completed" ? STATE_CLASS.paid : STATE_CLASS.undated}`}>{schedule.status === "completed" ? "הושלם" : "בוטל"}</span>}
          </div>
          <div className="text-xs text-neutral-500 truncate">
            {showClient && schedule.title}
            {deal && <> · עסקה: {deal.title}</>}
            {schedule.aiExtracted && <> · ✨ נקרא מהחוזה</>}
          </div>
        </div>
        <div className="text-end text-sm">
          <div><b>{fmtMoney(paid, schedule.currency)}</b> <span className="text-neutral-400">מתוך {fmtMoney(total, schedule.currency)}</span></div>
          <div className="mt-1 h-1.5 w-40 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      {schedule.summary && <p className="text-xs text-neutral-500 mt-2 leading-relaxed">{schedule.summary}</p>}

      <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
        {schedule.items.map((i) => {
          const st = itemState(i);
          return editing === i.id ? (
            <li key={i.id} className="py-2 grid grid-cols-2 sm:grid-cols-[1fr_7rem_9rem_1fr_auto] gap-2 items-center">
              <input className={`${input} col-span-2 sm:col-span-1`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <input className={input} type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              <input className={input} type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
              <input className={`${input} col-span-2 sm:col-span-1`} placeholder="תנאי" value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })} />
              <span className="flex gap-2 text-xs">
                <button onClick={() => run(async () => (await call("PATCH", `/api/payments/items/${i.id}`, payload()), setEditing(null)))} className="text-tint font-medium">שמירה</button>
                <button onClick={() => setEditing(null)} className="text-neutral-400">ביטול</button>
              </span>
            </li>
          ) : (
            <li key={i.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <input type="checkbox" checked={i.paid} onChange={(e) => run(() => call("PATCH", `/api/payments/items/${i.id}`, { paid: e.target.checked }))} aria-label="שולם" className="size-4" />
              <span className={`flex-1 min-w-40 ${i.paid ? "line-through text-neutral-400" : ""}`}>
                {i.description}
                {i.condition && !i.dueDate && <span className="text-xs text-neutral-400"> · {i.condition}</span>}
              </span>
              <span className="tabular-nums w-28 text-end">{fmtMoney(i.amount, schedule.currency)}</span>
              <span className="tabular-nums w-24 text-xs text-neutral-500">{fmtDate(i.dueDate)}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATE_CLASS[st]}`}>{STATE_LABEL[st]}</span>
              <button onClick={() => startEdit(i)} className="text-xs text-neutral-400 hover:text-neutral-700" aria-label="עריכה">✎</button>
              <button onClick={async () => (await confirmAction(`למחוק את התשלום "${i.description}"?`)) && run(() => call("DELETE", `/api/payments/items/${i.id}`))} className="text-xs text-neutral-300 hover:text-red-500" aria-label="מחיקה">×</button>
            </li>
          );
        })}
        {adding && (
          <li className="py-2 grid grid-cols-2 sm:grid-cols-[1fr_7rem_9rem_1fr_auto] gap-2 items-center">
            <input className={`${input} col-span-2 sm:col-span-1`} placeholder="תיאור" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} autoFocus />
            <input className={input} type="number" placeholder="סכום" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            <input className={input} type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
            <input className={`${input} col-span-2 sm:col-span-1`} placeholder="תנאי" value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })} />
            <span className="flex gap-2 text-xs">
              <button onClick={() => run(async () => (await apiPost("/api/payments/items", { scheduleId: schedule.id, ...payload() }), setAdding(false)))} className="text-tint font-medium">הוספה</button>
              <button onClick={() => setAdding(false)} className="text-neutral-400">ביטול</button>
            </span>
          </li>
        )}
      </ul>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
        <button onClick={() => (setAdding(true), setEditing(null), setDraft({ description: "", amount: "", dueDate: "", condition: "" }))} className="hover:text-neutral-800 dark:hover:text-neutral-200">+ תשלום</button>
        {schedule.fileId && <button onClick={openContract} className="hover:text-neutral-800 dark:hover:text-neutral-200">📄 פתיחת החוזה</button>}
        <button onClick={() => run(() => call("PATCH", `/api/payments/schedules/${schedule.id}`, { resync: true }))} className="hover:text-neutral-800 dark:hover:text-neutral-200" title="בניית התזכורות והמשימות מחדש לפי ההגדרות הנוכחיות">🔔 רענון תזכורות</button>
        {schedule.status === "cancelled" ? (
          <button onClick={() => run(() => call("PATCH", `/api/payments/schedules/${schedule.id}`, { status: "active" }))}>הפעלה מחדש</button>
        ) : (
          <button onClick={async () => (await confirmAction("לבטל את לוח התשלומים? התזכורות והמשימות הפתוחות יוסרו.")) && run(() => call("PATCH", `/api/payments/schedules/${schedule.id}`, { status: "cancelled" }))}>ביטול הלוח</button>
        )}
        <button onClick={async () => (await confirmAction(`למחוק את לוח התשלומים "${schedule.title}"?`)) && run(() => call("DELETE", `/api/payments/schedules/${schedule.id}`))} className="hover:text-red-500">מחיקה</button>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </section>
  );
}
