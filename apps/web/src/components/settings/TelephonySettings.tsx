"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { CopyButton } from "@/components/CopyButton";

type Connection = {
  id: string;
  provider: string;
  label: string | null;
  enabled: boolean;
  settings: { consentAnnouncement?: boolean; consentText?: string };
  webhookUrl: string | null;
  signingSecret: string | null;
};
type Data = { providers: { id: string; label: string }[]; connections: Connection[] };

const field = "w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent";

export function TelephonySettings({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState<string | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    setError("");
    try {
      setData(await apiPost<Data>("/api/telephony/connection", body));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "הפעולה נכשלה");
    }
  }, []);

  useEffect(() => {
    if (isAdmin) apiGet<Data>("/api/telephony/connection").then(setData).catch(() => setError("הטעינה נכשלה"));
  }, [isAdmin]);

  if (!isAdmin) return <p className="text-sm text-neutral-500">רק מנהלים מגדירים חיבור טלפוניה.</p>;
  const free = data?.providers.filter((p) => !data.connections.some((c) => c.provider === p.id)) ?? [];

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">טלפוניה</h2>
      <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
        גם בלי חיבור, לחיצה על מספר טלפון פותחת את החיוג, ואחרי השיחה נפתח טופס תיעוד (תוצאה, הערה ומשימת המשך). חיבור למערכת טלפונים מוסיף אוטומטית
        שיחות נכנסות, משך שיחה והקלטות על כרטיס הליד.
      </p>
      {error && <p className="text-sm text-red-500 mb-2">{error}</p>}

      {data?.connections.map((c) => {
        const label = data.providers.find((p) => p.id === c.provider)?.label ?? c.provider;
        return (
          <div key={c.id} className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-sm p-4 mb-4 space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold flex-1">{label}</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={c.enabled} onChange={(e) => call({ action: "update", id: c.id, enabled: e.target.checked })} />
                פעיל
              </label>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">כתובת ה-Webhook (מדביקים במערכת הטלפונים — לשמור בסוד)</p>
              <div className="flex items-center gap-2">
                <input readOnly dir="ltr" value={c.webhookUrl ?? ""} className={`${field} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
                {c.webhookUrl && <CopyButton text={c.webhookUrl} label="העתקת הכתובת" />}
              </div>
            </div>
            {c.provider === "generic" && (
              <div>
                <p className="text-xs text-neutral-500 mb-1">
                  מפתח חתימה — כל בקשה נחתמת ב-HMAC-SHA256 (כותרת <span dir="ltr">X-CRM-Signature: sha256=…</span>)
                </p>
                <div className="flex items-center gap-2">
                  <input readOnly dir="ltr" type={reveal === c.id ? "text" : "password"} value={c.signingSecret ?? ""} className={`${field} font-mono text-xs`} />
                  <button onClick={() => setReveal(reveal === c.id ? null : c.id)} className="text-xs text-neutral-500 shrink-0">
                    {reveal === c.id ? "הסתרה" : "הצגה"}
                  </button>
                  {c.signingSecret && <CopyButton text={c.signingSecret} label="העתקת המפתח" />}
                </div>
              </div>
            )}
            {c.provider === "voicenter" && <p className="text-xs text-neutral-500 leading-relaxed">ב-Voicenter מגדירים את הכתובת כ-CDR webhook. אין שם חתימה, לכן הכתובת עצמה היא הסיסמה.</p>}

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(c.settings.consentAnnouncement)}
                onChange={(e) => call({ action: "update", id: c.id, settings: { consentAnnouncement: e.target.checked, consentText: c.settings.consentText } })}
                className="mt-1"
              />
              <span>
                תזכורת לנציג להודיע על הקלטת השיחה
                <span className="block text-xs text-neutral-500">מוצגת בזמן השיחה. ההודעה עצמה צריכה להיות מוגדרת גם במערכת הטלפונים.</span>
              </span>
            </label>
            {c.settings.consentAnnouncement && (
              <input
                defaultValue={c.settings.consentText ?? ""}
                placeholder="להודיע ללקוח שהשיחה מוקלטת"
                onBlur={(e) => e.target.value !== (c.settings.consentText ?? "") && call({ action: "update", id: c.id, settings: { consentAnnouncement: true, consentText: e.target.value } })}
                className={field}
              />
            )}
            <button
              onClick={async () => {
                if (await confirmAction("הכתובת הנוכחית תפסיק לעבוד מיד, ויהיה צריך לעדכן אותה במערכת הטלפונים. ליצור כתובת ומפתח חדשים?")) call({ action: "rotate", id: c.id });
              }}
              className="text-xs text-red-600 hover:underline"
            >
              יצירת כתובת ומפתח חדשים
            </button>
          </div>
        );
      })}

      {free.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-500">חיבור מערכת טלפונים:</span>
          {free.map((p) => (
            <button key={p.id} onClick={() => call({ action: "create", provider: p.id })} className="px-3 min-h-9 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
              + {p.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
