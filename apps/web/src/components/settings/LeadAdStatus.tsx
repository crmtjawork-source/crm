"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";

type Form = { id: string; name?: string; status?: string; leadsCount?: number; recent: number; recentOurs: number };
type PageStatus = {
  id: string;
  pageId: string;
  pageName?: string;
  lastPollAt?: string | null;
  polledUntil?: string | null;
  lastPollError?: string | null;
  hasToken: boolean;
  token: { valid: boolean; expiresAt: string | null; dataAccessExpiresAt: string | null; scopes: string[]; error?: string } | null;
  totalSubmissions: number;
  lastSubmissionAt?: string | null;
  last24h: number;
  windowDays: number;
  windowTotal: number;
  windowOurs: number;
  forms: Form[];
  formsError?: string | null;
};

function ago(iso?: string | null) {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "ממש עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  if (min < 60 * 48) return `לפני ${Math.round(min / 60)} שע׳`;
  return new Date(iso).toLocaleDateString("he-IL");
}

function isStale(iso?: string | null) {
  return !iso || Date.now() - new Date(iso).getTime() > 15 * 60_000;
}

function expiresSoon(iso: string) {
  return new Date(iso).getTime() - Date.now() < 14 * 86_400_000;
}

function Row({ label, children, bad }: { label: string; children: React.ReactNode; bad?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-xs py-0.5">
      <span className="text-neutral-500">{label}</span>
      <span className={bad ? "text-red-600 font-medium" : ""}>{children}</span>
    </div>
  );
}

export function LeadAdStatus({ canManage }: { canManage: boolean }) {
  const [pages, setPages] = useState<PageStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiGet<{ pages: PageStatus[] }>("/api/lead-pages/status")
        .then((res) => {
          setPages(res.pages);
          setError(null);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "טעינת הסטטוס נכשלה")),
    []
  );

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  async function backfill(p: PageStatus) {
    if (!confirm("למשוך מפייסבוק את כל הלידים מ-30 הימים האחרונים שעוד לא במערכת? לא נשלחות הודעות אוטומטיות.")) return;
    setBusy(p.id);
    setMsg(null);
    try {
      const res = await apiPost<{ added: number }>("/api/lead-pages/backfill", { pageRowId: p.id, days: 30 });
      setMsg(res.added ? `נמשכו ${res.added} לידים חדשים` : "אין לידים חסרים — הכול כבר במערכת");
      await load();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "המשיכה נכשלה");
    } finally {
      setBusy(null);
    }
  }

  if (!canManage) return null;
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!pages) return <p className="text-xs text-neutral-400">טוען סטטוס…</p>;

  return (
    <div className="space-y-3 mb-3">
      {pages.map((p) => {
        const tokenBad = !p.hasToken || p.token?.valid === false || p.lastPollError?.startsWith("TOKEN:");
        const stale = isStale(p.lastPollAt);
        const pct = p.windowTotal ? Math.round((p.windowOurs / p.windowTotal) * 100) : 0;
        return (
          <div key={p.id} className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{p.pageName ?? p.pageId}</span>
              <span className={`text-xs ${tokenBad || p.lastPollError || stale ? "text-red-600" : "text-emerald-600"}`}>
                {tokenBad ? "● החיבור פג — יש לחבר מחדש" : p.lastPollError ? "● שגיאה במשיכה" : stale ? "● לא נמשך לאחרונה" : "● פעיל"}
              </span>
            </div>
            <div>
              <Row label="משיכה אחרונה מפייסבוק" bad={stale}>{ago(p.lastPollAt)}</Row>
              <Row label="ליד אחרון שנקלט">{ago(p.lastSubmissionAt)}</Row>
              <Row label="לידים ב-24 שעות האחרונות">{p.last24h}</Row>
              <Row label="סה״כ הוגשו דרך פייסבוק">{p.totalSubmissions}</Row>
              <Row label="טוקן גישה" bad={tokenBad}>
                {!p.hasToken ? "חסר" : p.token == null ? "לא ניתן לבדוק" : !p.token.valid ? `לא תקין${p.token.error ? ` (${p.token.error})` : ""}` : p.token.expiresAt ? `בתוקף עד ${new Date(p.token.expiresAt).toLocaleDateString("he-IL")}` : "קבוע (לא פג)"}
              </Row>
              {p.token?.valid && p.token.dataAccessExpiresAt && (
                <Row label="גישת מטא לנתוני לידים עד" bad={expiresSoon(p.token.dataAccessExpiresAt)}>
                  {new Date(p.token.dataAccessExpiresAt).toLocaleDateString("he-IL")}
                </Row>
              )}
              {p.token?.valid && !p.token.scopes.includes("leads_retrieval") && <Row label="הרשאת leads_retrieval" bad>חסרה</Row>}
            </div>
            {p.lastPollError && <p className="text-xs text-red-600 break-words">{p.lastPollError}</p>}

            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2">
              <p className="text-xs font-semibold text-neutral-500 mb-1">טפסים בדף</p>
              {p.formsError && <p className="text-xs text-red-600">{p.formsError}</p>}
              <ul className="space-y-1">
                {p.forms.map((f) => (
                  <li key={f.id} className="text-xs flex justify-between gap-2">
                    <span>
                      {f.name ?? f.id}
                      <span className="text-neutral-400"> · {f.status === "ACTIVE" ? "פעיל" : f.status ?? ""}</span>
                    </span>
                    <span className="text-neutral-500 shrink-0">
                      {f.recent} ב-{p.windowDays} ימים{f.leadsCount != null ? ` · ${f.leadsCount} סה״כ` : ""}
                    </span>
                  </li>
                ))}
                {!p.forms.length && !p.formsError && <li className="text-xs text-neutral-400">לא נמצאו טפסים.</li>}
              </ul>
            </div>

            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 text-xs space-y-1">
              <p className="font-semibold text-neutral-500">מוכנות לכיבוי שירות צד שלישי (פיירברי)</p>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                ב-{p.windowDays} הימים האחרונים הגיעו {p.windowTotal} לידים מהטפסים; {p.windowOurs} ({pct}%) נוצרו ראשונים על ידי המערכת עצמה, והשאר הגיעו קודם דרך
                השירות החיצוני ורק התמזגו אצלנו. כשהוא יכובה, כולם ייכנסו דרכנו, עד כ-2 דקות אחרי ההגשה.
              </p>
            </div>
            <button
              disabled={busy === p.id}
              onClick={() => backfill(p)}
              className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 disabled:opacity-50"
            >
              {busy === p.id ? "מושך…" : "משיכת לידים חסרים מ-30 הימים האחרונים"}
            </button>
          </div>
        );
      })}
      {msg && <p className="text-xs text-neutral-600 dark:text-neutral-300">{msg}</p>}
      {pages.length > 0 && (
        <details className="text-xs text-neutral-600 dark:text-neutral-300">
          <summary className="cursor-pointer text-neutral-500">מה צריך לעשות כדי לכבות את פיירברי</summary>
          <ol className="list-decimal ms-5 mt-2 space-y-1 leading-relaxed">
            <li>לוודא שהסטטוס למעלה &quot;פעיל&quot;, הטוקן קבוע (או בתוקף), ושכל הטפסים הפעילים של הקמפיינים מופיעים ברשימת הטפסים.</li>
            <li>להריץ &quot;משיכת לידים חסרים&quot; פעם אחת, כדי לוודא שאין לידים שהמערכת לא ראתה.</li>
            <li>לבדוק ב-Fireberry/פיירברי אילו אוטומציות עבדו על לידים חדשים (הודעת ברוכים הבאים, שיוך לנציג, סטטוס) ולהעתיק אותן לאוטומציות ב-CRM.</li>
            <li>לנתק את חיבור הפייסבוק מצד פיירברי (או להשהות אותו) ולהגיש ליד בדיקה בטופס. הוא אמור להופיע כאן תוך כ-2 דקות עם מקור &quot;פרסומת פייסבוק&quot;.</li>
            <li>לעקוב כמה ימים: &quot;נוצרו ראשונים על ידי המערכת&quot; צריך להגיע ל-100%. רק אז לבטל את המנוי.</li>
          </ol>
        </details>
      )}
    </div>
  );
}
