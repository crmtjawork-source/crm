"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

// Payment reminders: how many days before each due date, and whether tasks are created.
export function PaymentSettings({ isAdmin }: { isAdmin: boolean }) {
  const [days, setDays] = useState("7, 1");
  const [createTasks, setCreateTasks] = useState(true);
  const [ai, setAi] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    apiGet<{ days: number[]; createTasks: boolean; aiConfigured: boolean }>("/api/payments/settings")
      .then((s) => (setDays(s.days.join(", ")), setCreateTasks(s.createTasks), setAi(s.aiConfigured)))
      .catch(() => {});
  }, []);
  async function save() {
    const list = days.split(/[,\s]+/).filter(Boolean).map(Number);
    if (list.some((n) => !Number.isInteger(n) || n < 0 || n > 365)) return setMsg("יש להזין מספרי ימים (0–365) מופרדים בפסיק");
    try {
      await apiPost("/api/payments/settings", { days: list, createTasks });
      setMsg("נשמר. תשלומים חדשים ישתמשו בהגדרה; בלוח קיים אפשר ללחוץ על ״רענון תזכורות״.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "השמירה נכשלה");
    }
  }
  return (
    <div className="max-w-xl space-y-4 text-sm">
      <p className="text-neutral-500">לכל תשלום עם תאריך נוצרות תזכורות (התראה במערכת + משימה למטפל בליד) כמה ימים לפני מועד התשלום. אפשר גם לבנות אוטומציה מסוג ״תזכורת תשלום״.</p>
      <label className="block">
        <span className="block text-xs text-neutral-500 mb-1">כמה ימים לפני התשלום להזכיר (מופרד בפסיק, 0 = ביום התשלום)</span>
        <input value={days} onChange={(e) => setDays(e.target.value)} disabled={!isAdmin} className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent" />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={createTasks} disabled={!isAdmin} onChange={(e) => setCreateTasks(e.target.checked)} /> ליצור גם משימה לכל תזכורת</label>
      {isAdmin && <button onClick={save} className="px-3 py-1.5 rounded-md bg-tint text-white">שמירה</button>}
      {msg && <p className="text-xs text-neutral-500">{msg}</p>}
      {ai === false && <p className="text-xs text-amber-600">קריאת חוזים עם AI עדיין לא הופעלה: צריך להגדיר ANTHROPIC_API_KEY בשרת (Vercel). עד אז ממלאים ידנית.</p>}
      {ai === true && <p className="text-xs text-emerald-600">קריאת חוזים עם AI פעילה.</p>}
    </div>
  );
}
