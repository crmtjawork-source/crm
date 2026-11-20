"use client";

import { useState } from "react";
import { ScheduleWizard } from "./ScheduleWizard";
import { ScheduleCard } from "./ScheduleCard";
import { usePayments } from "./usePayments";

// "לוח תשלומים" on the lead card: upload a contract, review what AI read, follow the payments.
export function LeadPayments({ contactId }: { contactId: string }) {
  const { schedules, reload, loading } = usePayments(contactId);
  const [adding, setAdding] = useState(false);
  if (loading) return null;
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-neutral-500">לוח תשלומים</h2>
        <button onClick={() => setAdding(true)} className="text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800">+ לוח תשלומים / חוזה</button>
      </div>
      {schedules.length === 0 ? (
        <p className="text-xs text-neutral-400">אין לוח תשלומים. אפשר להעלות חוזה ו-AI יקרא ממנו את התשלומים.</p>
      ) : (
        <div className="space-y-2">{schedules.map((s) => <ScheduleCard key={s.id} schedule={s} onChange={reload} showClient={false} />)}</div>
      )}
      {adding && <ScheduleWizard contactId={contactId} onClose={() => setAdding(false)} onDone={() => (setAdding(false), reload())} />}
    </section>
  );
}
