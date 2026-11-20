"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";

type Held = { id: string; reason: string | null; held_at: string; status: string; error: string | null; automationName: string; contactName: string };
type Sched = { id: string; label: string; hold_reason: string | null; contactName: string };
type Data = {
  state: { configured: boolean; anyUp: boolean; down: Array<{ id: string; name: string; since: string | null }> };
  defaults: { channel_mode?: "whatsapp" | "auto"; fallback?: string; hold_expire_hours?: number };
  emailConfigured: boolean;
  held: Held[];
  scheduled: Sched[];
};

const FALLBACKS: Array<[string, string]> = [
  ["hold", "להמתין לחיבור ולשלוח אוטומטית"],
  ["task", "משימה לבעל הליד לשלוח ידנית"],
  ["notify", "התראה לבעל הליד"],
  ["email", "אימייל לליד (דורש הגדרת שירות אימייל)"],
  ["skip", "לדלג על ההודעה"],
];
const inputClass = "px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent";

// Health of the org's WhatsApp for automations: banner when it is down, the queue
// of messages waiting for it (auto-sent on reconnect, or one click), and the
// org-wide default for "channel: auto".
export default function WhatsAppHealthPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"whatsapp" | "auto">("whatsapp");
  const [fallback, setFallback] = useState("hold");
  const [hours, setHours] = useState("72");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Data>("/api/automations/held");
      setData(d);
    } catch {
      /* the page works without it */
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(data.defaults.channel_mode ?? "whatsapp");
    setFallback(data.defaults.fallback ?? "hold");
    setHours(String(data.defaults.hold_expire_hours ?? 72));
  }, [data]);

  if (!data) return null;
  const pending = data.held.filter((h) => h.status === "pending");
  const problems = data.held.filter((h) => h.status !== "pending");
  const down = !data.state.configured || !data.state.anyUp || data.state.down.length > 0;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "הפעולה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 space-y-3">
      {down && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            ⚠ {!data.state.configured ? "אין חיבור וואטסאפ מוגדר" : data.state.anyUp ? `חלק ממספרי הוואטסאפ מנותקים: ${data.state.down.map((d) => d.name).join(", ")}` : "הוואטסאפ מנותק"}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
            אוטומציות שלא תלויות בוואטסאפ (משימות, שלבים, שדות, תגיות, התראות) ממשיכות לרוץ כרגיל. הודעות וואטסאפ מטופלות לפי ההגדרה של כל צעד: ממתינות לחיבור ונשלחות לבד כשהוא חוזר, או עוברות לחלופה.
          </p>
          <Link href="/settings/integrations" className="text-xs underline text-amber-800 dark:text-amber-300">
            חיבור וואטסאפ ←
          </Link>
        </div>
      )}

      {(pending.length > 0 || data.scheduled.length > 0) && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">
              ⏸ ממתין לחיבור וואטסאפ: {pending.length} הודעות אוטומציה{data.scheduled.length > 0 ? ` · ${data.scheduled.length} תזכורות מתוזמנות` : ""}
            </p>
            {pending.length > 0 && (
              <button
                disabled={busy || down}
                title={down ? "אפשר לשלוח רק כשהוואטסאפ מחובר" : "שולח את כל ההודעות הממתינות עכשיו (פעם אחת לכל הודעה)"}
                onClick={() => act(async () => { const r = await apiPost<{ sent: number; failed: number; stillHeld: number }>("/api/automations/held", { action: "release" }); setMsg(`נשלחו ${r.sent}, נכשלו ${r.failed}, עדיין ממתינות ${r.stillHeld}`); })}
                className="text-xs px-3 py-1.5 rounded-md bg-tint text-white disabled:opacity-40"
              >
                שליחת כל הממתינות עכשיו
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">הודעות אלה נשלחות אוטומטית דקה אחרי שהוואטסאפ מתחבר מחדש; ללא כפל שליחה.</p>
          <ul className="mt-2 space-y-1">
            {pending.slice(0, 10).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 text-xs bg-neutral-50 dark:bg-neutral-900 rounded-md px-2 py-1.5">
                <span>
                  {h.contactName || "ליד"} · {h.automationName} · <span className="text-neutral-500">{h.reason}</span>
                </span>
                <button disabled={busy} onClick={() => act(async () => { await apiPost("/api/automations/held", { action: "cancel", id: h.id }); })} className="text-neutral-400 hover:text-red-500 shrink-0">
                  ביטול
                </button>
              </li>
            ))}
            {pending.length > 10 && <li className="text-xs text-neutral-500">ועוד {pending.length - 10}…</li>}
            {data.scheduled.slice(0, 5).map((s) => (
              <li key={s.id} className="text-xs bg-neutral-50 dark:bg-neutral-900 rounded-md px-2 py-1.5">
                {s.contactName || "ליד"} · {s.label} · <span className="text-neutral-500">{s.hold_reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 p-3 text-xs">
          <p className="font-medium text-red-700 dark:text-red-400 mb-1">הודעות שלא נשלחו ({problems.length})</p>
          <ul className="space-y-0.5">
            {problems.slice(0, 5).map((h) => (
              <li key={h.id}>
                {h.contactName} · {h.automationName} · {h.status === "expired" ? "פג תוקף ההמתנה — נפתחה משימה" : h.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-neutral-500 underline">
          ברירת מחדל של העסק: כשהוואטסאפ לא זמין
        </button>
        {open && (
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => { await apiPost("/api/automations/held", { action: "defaults", channelMode: mode, fallback, holdExpireHours: Number(hours) }); setMsg("נשמר"); });
            }}
          >
            <select value={mode} onChange={(e) => setMode(e.target.value as "whatsapp" | "auto")} className={inputClass}>
              <option value="whatsapp">וואטסאפ בלבד — ממתין לחיבור</option>
              <option value="auto">אוטומטי — וואטסאפ, ואם לא מחובר: חלופה</option>
            </select>
            {mode === "auto" && (
              <select value={fallback} onChange={(e) => setFallback(e.target.value)} className={inputClass}>
                {FALLBACKS.map(([v, l]) => (
                  <option key={v} value={v} disabled={v === "email" && !data.emailConfigured}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            <label className="text-xs flex items-center gap-1">
              ממתין עד
              <input value={hours} onChange={(e) => setHours(e.target.value)} type="number" min={1} className={`w-16 ${inputClass}`} /> שעות, ואז משימה
            </label>
            <button disabled={busy} className="text-xs px-3 py-1.5 rounded-md bg-tint text-white">
              שמירה
            </button>
          </form>
        )}
      </div>
      {msg && <p className="text-xs text-neutral-500">{msg}</p>}
    </div>
  );
}
