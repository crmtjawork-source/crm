"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import { fmtDate, fmtMoney, itemState, localDay, STATE_CLASS, STATE_LABEL, sumAmounts, type ItemState, type PaymentItem } from "@/lib/payments";
import { usePayments } from "@/components/payments/usePayments";
import { ScheduleCard } from "@/components/payments/ScheduleCard";
import { ScheduleWizard } from "@/components/payments/ScheduleWizard";

type Filter = "all" | "open" | ItemState;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "open", label: "פתוחים" },
  { id: "overdue", label: "באיחור" },
  { id: "soon", label: "בקרוב (14 יום)" },
  { id: "upcoming", label: "עתידיים" },
  { id: "paid", label: "שולמו" },
];

// Payment-schedule board: every client's deal, contract and payments in one place.
export default function PaymentsPage() {
  const { contacts } = useStore();
  const { schedules, loading, error, reload } = usePayments();
  const [view, setView] = useState<"clients" | "dates">("clients");
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [creating, setCreating] = useState(false);
  const today = localDay();

  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name ?? "";
  const live = schedules.filter((s) => showCancelled || s.status !== "cancelled");
  const allItems = live.flatMap((s) => s.items.map((i) => ({ item: i, schedule: s })));

  const stats = useMemo(() => {
    const active = schedules.filter((s) => s.status === "active").flatMap((s) => s.items);
    const unpaid = active.filter((i) => !i.paid);
    const in30 = localDay(new Date(new Date(`${today}T12:00:00`).getTime() + 30 * 86400000));
    return {
      overdue: sumAmounts(unpaid.filter((i) => i.dueDate && i.dueDate < today)),
      overdueCount: unpaid.filter((i) => i.dueDate && i.dueDate < today).length,
      next30: sumAmounts(unpaid.filter((i) => i.dueDate && i.dueDate >= today && i.dueDate <= in30)),
      outstanding: sumAmounts(unpaid),
      paid: sumAmounts(active.filter((i) => i.paid)),
      clients: new Set(schedules.filter((s) => s.status === "active").map((s) => s.contactId)).size,
    };
  }, [schedules, today]);

  const q = query.trim().toLowerCase();
  const matchItem = (i: PaymentItem, title: string, contactId: string) => {
    const st = itemState(i, today);
    if (filter === "open" ? i.paid : filter !== "all" && st !== filter) return false;
    if (month && !i.dueDate?.startsWith(month)) return false;
    if (q && !`${contactName(contactId)} ${title} ${i.description}`.toLowerCase().includes(q)) return false;
    return true;
  };
  const rows = allItems.filter((r) => matchItem(r.item, r.schedule.title, r.schedule.contactId)).sort((a, b) => `${a.item.dueDate ?? "9999"}`.localeCompare(`${b.item.dueDate ?? "9999"}`));
  const visibleSchedules = live.filter((s) => {
    if (q && !`${contactName(s.contactId)} ${s.title}`.toLowerCase().includes(q) && !s.items.some((i) => i.description.toLowerCase().includes(q))) return false;
    if (filter === "all" && !month) return true;
    return s.items.some((i) => matchItem(i, s.title, s.contactId)) || (filter === "all" && s.items.length === 0);
  });

  async function togglePaid(i: PaymentItem) {
    const { data } = await supabase.auth.getSession();
    await fetch(`/api/payments/items/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ paid: !i.paid }) });
    reload();
  }

  const card = (label: string, value: string, sub?: string, tone = "") => (
    <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-400">{sub}</div>}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-xl font-bold">לוח תשלומים</h1>
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded-md bg-tint text-white">+ לוח תשלומים חדש</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {card("באיחור", fmtMoney(stats.overdue), `${stats.overdueCount} תשלומים`, stats.overdue > 0 ? "text-red-600" : "")}
        {card("ב-30 הימים הקרובים", fmtMoney(stats.next30))}
        {card("סה״כ פתוח לגבייה", fmtMoney(stats.outstanding), `${stats.clients} לקוחות`)}
        {card("שולם", fmtMoney(stats.paid), undefined, "text-emerald-600")}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs">
          {([["clients", "לפי לקוח"], ["dates", "לפי תאריך"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={`px-3 py-1.5 ${view === id ? "bg-tint text-white" : ""}`}>{label}</button>
          ))}
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="text-xs px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent">
          {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent" aria-label="חודש" />
        {month && <button onClick={() => setMonth("")} className="text-xs text-neutral-400">× ניקוי חודש</button>}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לקוח / עסקה / תשלום" className="text-xs px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent flex-1 min-w-40" />
        <label className="text-xs text-neutral-500 flex items-center gap-1"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> כולל מבוטלים</label>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-neutral-400">טוען…</p>
      ) : view === "clients" ? (
        visibleSchedules.length === 0 ? (
          <p className="text-sm text-neutral-400">{schedules.length === 0 ? "עוד אין לוחות תשלומים. אחרי חתימה — מעלים חוזה והמערכת קוראת ממנו את התשלומים." : "אין תוצאות לסינון הזה."}</p>
        ) : (
          <div className="space-y-3">{visibleSchedules.map((s) => <ScheduleCard key={s.id} schedule={s} onChange={reload} />)}</div>
        )
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-400">אין תשלומים לסינון הזה.</p>
      ) : (
        <ul className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map(({ item, schedule }) => {
            const st = itemState(item, today);
            return (
              <li key={item.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <input type="checkbox" checked={item.paid} onChange={() => togglePaid(item)} aria-label="שולם" className="size-4" />
                <span className="tabular-nums w-24 text-xs text-neutral-500">{fmtDate(item.dueDate)}</span>
                <Link href={`/contacts/${schedule.contactId}`} className="font-medium hover:underline w-36 truncate">{contactName(schedule.contactId)}</Link>
                <span className={`flex-1 min-w-40 truncate ${item.paid ? "line-through text-neutral-400" : ""}`}>{item.description} <span className="text-xs text-neutral-400">· {schedule.title}</span></span>
                <span className="tabular-nums w-28 text-end">{fmtMoney(item.amount, schedule.currency)}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATE_CLASS[st]}`}>{STATE_LABEL[st]}</span>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <ScheduleWizard onClose={() => setCreating(false)} onDone={() => (setCreating(false), reload())} />}
    </div>
  );
}
