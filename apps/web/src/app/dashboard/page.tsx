"use client";

import { useStore } from "@/lib/store";

export default function DashboardPage() {
  const { contacts, opportunities, pipelines, tasks } = useStore();

  const openOpportunities = opportunities.filter((o) => o.status === "open");
  const wonOpportunities = opportunities.filter((o) => o.status === "won");
  const closedCount = opportunities.length - openOpportunities.length;
  const totalOpenValue = openOpportunities.reduce((sum, o) => sum + o.value, 0);
  // Close rate among decided opportunities — open ones haven't had a chance yet.
  const conversionRate = closedCount ? Math.round((wonOpportunities.length / closedCount) * 1000) / 10 : 0;
  const openTasks = tasks.filter((t) => !t.done);
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10));

  const byStage = pipelines.flatMap((p) =>
    p.stages.map((stage) => ({
      key: `${p.id}-${stage.id}`,
      label: pipelines.length > 1 ? `${p.name} · ${stage.name}` : stage.name,
      count: openOpportunities.filter((o) => o.pipelineId === p.id && o.stageId === stage.id).length,
    }))
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-6">לוח בקרה</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="לידים" value={contacts.length} />
        <Stat label="הזדמנויות פתוחות" value={openOpportunities.length} />
        <Stat label="שווי פתוח" value={`₪${totalOpenValue.toLocaleString("he-IL")}`} />
        <Stat label="אחוז סגירה" value={`${conversionRate}%`} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">הזדמנויות פתוחות לפי שלב</h2>
          <div className="space-y-2">
            {byStage.map(({ key, label, count }) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="w-32 truncate">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 dark:bg-white"
                    style={{ width: `${openOpportunities.length ? (count / openOpportunities.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-neutral-500 w-6 text-end">{count}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">משימות</h2>
          <div className="space-y-1 text-sm">
            <p>{openTasks.length} משימות פתוחות</p>
            {overdueTasks.length > 0 && <p className="text-red-500">{overdueTasks.length} באיחור</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{label}</div>
    </div>
  );
}
