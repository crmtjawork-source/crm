"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SlotDay = { label: string; slots: Array<{ start: string; label: string }> };
type View =
  | { status: "not_found" }
  | { status: "unavailable"; orgName: string }
  | {
      status: "open";
      firstName: string;
      orgName: string;
      typeName: string;
      durationMinutes: number;
      days: SlotDay[];
      existing: { start: string; label: string } | null;
    };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

export default function BookingPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ label: string; rescheduled: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/public/booking/${token}`)
      .then((r) => r.json())
      .then(setView)
      .catch(() => setView({ status: "not_found" }));
  }, [token]);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/booking/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: selected }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "קביעת השיחה נכשלה");
        // The slot may have just been taken — refresh what's free.
        fetch(`/api/public/booking/${token}`).then((r) => r.json()).then(setView);
        setSelected(null);
        return;
      }
      setBooked({ label: json.label, rescheduled: json.rescheduled });
    } catch {
      setError("אין חיבור — נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <Shell>
        <p className="text-center text-sm text-neutral-400">טוען…</p>
      </Shell>
    );
  }

  if (view.status === "not_found") {
    return (
      <Shell>
        <p className="text-center text-sm text-neutral-500">הקישור לא תקין או שפג תוקפו.</p>
      </Shell>
    );
  }

  if (view.status === "unavailable") {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-center mb-2">{view.orgName}</h1>
        <p className="text-center text-sm text-neutral-500">קביעת שיחה אונליין לא זמינה כרגע — ניצור איתך קשר בקרוב.</p>
      </Shell>
    );
  }

  if (booked) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 text-center space-y-2">
          <p className="text-3xl">✓</p>
          <h1 className="text-lg font-bold">{booked.rescheduled ? "המועד עודכן" : "השיחה נקבעה"}</h1>
          <p className="text-sm">{booked.label}</p>
          <p className="text-sm text-neutral-500">נדבר בקרוב 😀 {view.orgName}</p>
        </div>
      </Shell>
    );
  }

  const day = view.days[Math.min(dayIndex, Math.max(view.days.length - 1, 0))];

  return (
    <Shell>
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 space-y-5">
        <div>
          <p className="text-xs text-neutral-500">{view.orgName}</p>
          <h1 className="text-xl font-bold mt-1">היי {view.firstName} 👋</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
            בחרו מועד ל{view.typeName} ({view.durationMinutes} דק&apos;)
          </p>
        </div>

        {view.existing && (
          <p className="text-sm rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-3 py-2">
            כבר קבעת שיחה ל{view.existing.label} — אפשר לבחור מועד אחר במקומו
          </p>
        )}

        {view.days.length === 0 ? (
          <p className="text-sm text-neutral-500">אין כרגע מועדים פנויים בשבועיים הקרובים — ניצור איתך קשר.</p>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {view.days.map((d, i) => (
                <button
                  key={d.label}
                  onClick={() => {
                    setDayIndex(i);
                    setSelected(null);
                  }}
                  className={`shrink-0 px-3 py-2 rounded-lg text-sm border ${
                    i === dayIndex
                      ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                      : "border-neutral-200 dark:border-neutral-700"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {day.slots.map((s) => (
                <button
                  key={s.start}
                  onClick={() => setSelected(s.start)}
                  dir="ltr"
                  className={`py-2 rounded-lg text-sm border ${
                    selected === s.start
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "border-neutral-200 dark:border-neutral-700 hover:border-emerald-500"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={confirm}
          disabled={!selected || busy}
          className="w-full py-3 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-40"
        >
          {busy ? "קובע…" : view.existing ? "עדכון המועד" : "קביעת השיחה"}
        </button>
      </div>
    </Shell>
  );
}
