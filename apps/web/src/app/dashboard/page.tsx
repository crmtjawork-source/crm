"use client";

import Link from "next/link";
import { CheckCircle2, CircleDollarSign, Flag, TrendingUp, UserPlus, Users, type LucideIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { colorAt } from "@/components/ui/ColorChip";
import { needsAssignment } from "@/components/leads/OwnerSelect";

const card = "rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm";
const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE"); // yyyy-mm-dd, local time

export default function DashboardPage() {
  const { contacts, opportunities, pipelines, tasks, members, currentMemberId, toggleTask } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const today = dayKey(new Date());

  const open = opportunities.filter((o) => o.status === "open");
  const won = opportunities.filter((o) => o.status === "won");
  const decided = opportunities.length - open.length;
  const openValue = open.reduce((s, o) => s + o.value, 0);
  // Close rate among decided deals: open ones haven't had a chance yet.
  const closeRate = decided ? Math.round((won.length / decided) * 1000) / 10 : 0;
  const monthStart = today.slice(0, 7);
  const wonThisMonth = won.filter((o) => (o.closedAt ?? o.stageChangedAt).slice(0, 7) === monthStart);

  const newToday = contacts.filter((c) => dayKey(new Date(c.createdAt)) === today).length;
  const unassigned = contacts.filter((c) => needsAssignment(c)).length;

  // New leads per day, last 7 days.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { key: dayKey(d), label: d.toLocaleDateString("he-IL", { weekday: "narrow" }), count: 0 };
  });
  for (const c of contacts) {
    const slot = days.find((d) => d.key === dayKey(new Date(c.createdAt)));
    if (slot) slot.count += 1;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  const stages = pipelines.flatMap((p) =>
    p.stages.map((stage, i) => {
      const deals = open.filter((o) => o.pipelineId === p.id && o.stageId === stage.id);
      return {
        key: `${p.id}-${stage.id}`,
        label: pipelines.length > 1 ? `${p.name} · ${stage.name}` : stage.name,
        color: colorAt(stage.color, i),
        count: deals.length,
        value: deals.reduce((s, o) => s + o.value, 0),
      };
    })
  );
  const maxStage = Math.max(1, ...stages.map((s) => s.count));

  // What needs attention: overdue first, then today.
  const urgent = tasks
    .filter((t) => !t.done && t.dueDate && t.dueDate <= today)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 6);
  const overdueCount = tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today).length;
  const todayCount = tasks.filter((t) => !t.done && t.dueDate === today).length;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "לילה טוב" : hour < 12 ? "בוקר טוב" : hour < 18 ? "צהריים טובים" : "ערב טוב";

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{me ? `${greeting}, ${me.name.split(" ")[0]}` : "לוח בקרה"}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
          {newToday > 0 && ` · ${newToday} לידים חדשים היום`}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={Users} color="#0a84ff" label="לידים" value={contacts.length.toLocaleString("he-IL")} hint={newToday ? `${newToday} חדשים היום` : "אין חדשים היום"} />
        <Stat icon={CircleDollarSign} color="#ff9f0a" label="שווי פתוח" value={ils(openValue)} hint={`${open.length} הזדמנויות פתוחות`} />
        <Stat icon={Flag} color="#30d158" label="נסגרו החודש" value={String(wonThisMonth.length)} hint={ils(wonThisMonth.reduce((s, o) => s + o.value, 0))} />
        <Stat icon={TrendingUp} color="#bf5af2" label="אחוז סגירה" value={`${closeRate}%`} hint={`${won.length} מתוך ${decided} שהוכרעו`} />
      </div>

      {unassigned > 0 && (
        <Link href="/pipeline" className="mb-6 flex items-center gap-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm hover:brightness-95">
          <UserPlus size={18} className="text-amber-600 dark:text-amber-400" aria-hidden />
          <span className="font-medium">{unassigned} לידים מחכים לשיוך</span>
          <span className="ms-auto text-amber-700 dark:text-amber-300 text-xs">לשיוך ←</span>
        </Link>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        <section className={`${card} p-5 lg:col-span-3`}>
          <h2 className="text-sm font-semibold text-neutral-500 mb-4">הזדמנויות פתוחות לפי שלב</h2>
          {stages.length === 0 ? (
            <p className="text-sm text-neutral-400">עוד אין שלבים.</p>
          ) : (
            <div className="space-y-3">
              {stages.map((s) => (
                <div key={s.key}>
                  <div className="flex items-baseline justify-between text-sm mb-1">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-neutral-500 tabular-nums">
                      {s.count}
                      {s.value > 0 && <span className="text-neutral-400"> · {ils(s.value)}</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-black/[.06] dark:bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / maxStage) * 100}%`, backgroundColor: s.color, minWidth: s.count ? 6 : 0 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`${card} p-5 lg:col-span-2`}>
          <h2 className="text-sm font-semibold text-neutral-500 mb-1">לידים חדשים, 7 ימים אחרונים</h2>
          <p className="text-2xl font-bold tabular-nums mb-3">{days.reduce((s, d) => s + d.count, 0)}</p>
          <div className="flex items-end gap-2 h-24" role="img" aria-label="לידים חדשים לפי יום">
            {days.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[11px] text-neutral-500 tabular-nums">{d.count || ""}</span>
                <div className={`w-full rounded-md ${d.key === today ? "bg-tint" : "bg-tint/30"}`} style={{ height: `${Math.max(4, (d.count / maxDay) * 64)}px` }} />
                <span className="text-[11px] text-neutral-400">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${card} p-5 lg:col-span-5`}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-500">דורש טיפול</h2>
            <Link href="/tasks" className="text-xs text-tint hover:underline">
              כל המשימות
            </Link>
          </div>
          {urgent.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-neutral-500">
              <CheckCircle2 size={18} className="text-whatsapp" aria-hidden />
              אין משימות באיחור או להיום. כל הכבוד.
            </p>
          ) : (
            <>
              <p className="text-xs text-neutral-400 mb-2">
                {overdueCount > 0 && <span className="text-red-500">{overdueCount} באיחור</span>}
                {overdueCount > 0 && todayCount > 0 && " · "}
                {todayCount > 0 && `${todayCount} להיום`}
              </p>
              <ul className="divide-y divide-black/[.06] dark:divide-white/10">
                {urgent.map((t) => {
                  const lead = contacts.find((c) => c.id === t.contactId);
                  const late = t.dueDate! < today;
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <input type="checkbox" aria-label="סימון כבוצע" onChange={() => toggleTask(t.id)} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {lead && (
                        <Link href={`/contacts/${lead.id}`} className="shrink-0 text-xs text-tint hover:underline max-w-32 truncate">
                          {lead.name}
                        </Link>
                      )}
                      <span className={`shrink-0 text-xs tabular-nums ${late ? "text-red-500" : "text-neutral-500"}`}>
                        {late ? new Date(t.dueDate!).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }) : t.dueTime ?? "היום"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, color, label, value, hint }: { icon: LucideIcon; color: string; label: string; value: string; hint: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ backgroundColor: color }}>
          <Icon size={15} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="text-xs font-medium text-neutral-500">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-neutral-400 mt-1">{hint}</div>
    </div>
  );
}
