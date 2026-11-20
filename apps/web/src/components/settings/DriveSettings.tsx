"use client";

import { confirmAction } from "@/lib/confirm";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { apiPost, ApiError } from "@/lib/api";
import { hasDriveScope } from "@/lib/driveScope";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const RESULT: Record<string, { ok: boolean; text: string }> = {
  drive_connected: { ok: true, text: "גוגל דרייב חובר ✓" },
  drive_no_scope: { ok: false, text: "החיבור הושלם אבל לא אושרה הרשאת דרייב. לחצו ״חיבור מחדש״ וסמנו את ההרשאה לניהול קבצי דרייב." },
  denied: { ok: false, text: "החיבור בוטל בגוגל." },
  no_refresh: { ok: false, text: "גוגל לא נתן הרשאה קבועה. הסירו את הגישה בהגדרות חשבון הגוגל ונסו שוב." },
  error: { ok: false, text: "החיבור נכשל. נסו שוב." },
};

export function DriveSettings({ isAdmin = false }: { isAdmin?: boolean }) {
  const { membership } = useAuth();
  const orgId = membership?.orgId;
  const params = useSearchParams();
  const result = RESULT[params.get("google") ?? ""];
  const [s, setS] = useState<Row | null | undefined>(undefined);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [template, setTemplate] = useState("{{name}}");
  const [root, setRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const apply = useCallback(
    (r: { data: Row | null; jobs: Row[] }) => {
      setS(r.data);
      if (r.data) {
        setTemplate(r.data.folder_template);
        setRoot(r.data.root_folder_url ?? "");
      }
      setJobs(r.jobs);
    },
    []
  );
  const fetchAll = useCallback(async () => {
    const { data } = await supabase.from("drive_settings").select("*").eq("org_id", orgId ?? "").maybeSingle();
    const { data: j } = await supabase
      .from("drive_jobs")
      .select("id, kind, status, attempts, error, created_at, contact_id, contacts(name)")
      .neq("status", "done")
      .order("created_at", { ascending: false })
      .limit(20);
    return { data: (data as Row | null) ?? null, jobs: (j as Row[]) ?? [] };
  }, [orgId]);
  const load = useCallback(async () => apply(await fetchAll()), [apply, fetchAll]);
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    fetchAll().then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
  }, [orgId, fetchAll, apply]);

  async function act(body: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setMsg("");
    try {
      const r = await apiPost<{ url?: string }>("/api/integrations/drive", body);
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      after?.();
      await load();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "הפעולה נכשלה");
    }
    setBusy(false);
  }

  const missingScope = !!s && !hasDriveScope(s.scopes);
  const failed = jobs.filter((j) => j.status === "failed");
  const pending = jobs.filter((j) => j.status === "pending");

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">גוגל דרייב</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        אחרי שליד חותם על מסמך במערכת, נפתחת לו תיקייה בדרייב (בשמו) וה-PDF החתום נשמר בתוכה. אפשר גם להעלות לשם כל קובץ מכרטיס הליד, למשל הסכם רכישה
        סרוק. מחברים פעם אחת, מחשבון הגוגל של העסק.
      </p>
      {result && <p className={`text-sm mb-3 ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{result.text}</p>}
      {s === undefined ? (
        <p className="text-sm text-neutral-400">בודק…</p>
      ) : !s ? (
        isAdmin ? (
          <button onClick={() => act({ action: "start" })} disabled={busy} className="px-3 py-1.5 text-sm rounded-md bg-tint text-white disabled:opacity-50">
            {busy ? "מעביר לגוגל…" : "חיבור גוגל דרייב"}
          </button>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">רק מנהלים יכולים לחבר את הדרייב.</p>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            {missingScope ? <span className="text-amber-600 dark:text-amber-400">מחובר, אבל חסרה הרשאת דרייב</span> : <span className="text-emerald-600 dark:text-emerald-400">מחובר ✓</span>}
            {s.account_email && (
              <span className="text-neutral-500" dir="ltr">
                {s.account_email}
              </span>
            )}
            {isAdmin && (
              <span className="ms-auto flex gap-3">
                <button onClick={() => act({ action: "start" })} className="text-xs text-neutral-500 hover:underline">
                  חיבור מחדש
                </button>
                <button
                  onClick={async () => (await confirmAction("לנתק את הדרייב? קבצים שכבר נשמרו נשארים בדרייב.")) && act({ action: "disconnect" })}
                  className="text-xs text-neutral-400 hover:text-red-500"
                >
                  ניתוק
                </button>
              </span>
            )}
          </div>
          {missingScope && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm">
              <p className="mb-2">גוגל לא קיבל הרשאה לנהל קבצים בדרייב (ייתכן שהתיבה לא סומנה במסך האישור). שמירה בדרייב לא תעבוד עד שתחברו מחדש.</p>
              {isAdmin && (
                <button onClick={() => act({ action: "start" })} disabled={busy} className="px-3 py-1.5 text-sm rounded-md bg-tint text-white">
                  חיבור מחדש והענקת הרשאת דרייב
                </button>
              )}
            </div>
          )}
          {s.last_error && !missingScope && <p className="text-xs text-red-500">{s.last_error}</p>}

          <div className="grid gap-3 max-w-lg text-sm">
            <label className="block">
              <span className="text-neutral-500">שם תיקיית הלקוח</span>
              <input value={template} onChange={(e) => setTemplate(e.target.value)} disabled={!isAdmin} dir="rtl" className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5" />
              <span className="text-xs text-neutral-400">משתנים: {"{{name}}"} {"{{phone}}"} {"{{email}}"} — למשל {"{{name}} - {{phone}}"}. חל על תיקיות חדשות בלבד.</span>
            </label>
            <label className="block">
              <span className="text-neutral-500">תיקיית שורש</span>
              <input value={root} onChange={(e) => setRoot(e.target.value)} disabled={!isAdmin} dir="ltr" placeholder={`ריק = המערכת תיצור תיקייה "${s.root_folder_name}" בדרייב`} className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5" />
              <span className="text-xs text-neutral-400">
                קישור לתיקייה קיימת (דורש גישה מלאה לדרייב). בהרשאת ברירת המחדל המערכת רואה רק תיקיות שיצרה בעצמה.
                {s.root_folder_url && (
                  <>
                    {" "}
                    <a href={s.root_folder_url} target="_blank" rel="noopener" className="text-tint hover:underline">
                      פתיחת תיקיית השורש ↗
                    </a>
                  </>
                )}
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.auto_save_signed} disabled={!isAdmin} onChange={(e) => act({ action: "save_settings", autoSaveSigned: e.target.checked })} />
              <span>לשמור אוטומטית בדרייב כל מסמך שנחתם</span>
            </label>
            {isAdmin && (
              <button
                onClick={() => act({ action: "save_settings", folderTemplate: template, rootFolder: root }, () => setMsg("נשמר ✓"))}
                disabled={busy}
                className="self-start px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 disabled:opacity-50"
              >
                שמירה
              </button>
            )}
          </div>

          {(failed.length > 0 || pending.length > 0) && (
            <div className="text-sm">
              <h3 className="font-semibold mb-1">
                {failed.length > 0 && <span className="text-red-500">{failed.length} נכשלו</span>}
                {failed.length > 0 && pending.length > 0 && " · "}
                {pending.length > 0 && <span className="text-neutral-500">{pending.length} ממתינים לניסיון חוזר</span>}
              </h3>
              <ul className="text-xs text-neutral-500 space-y-1 mb-2">
                {jobs.map((j) => (
                  <li key={j.id}>
                    {j.status === "failed" ? "✖️" : "⏳"} {j.contacts?.name ?? "ליד"} · {j.kind === "document" ? "מסמך חתום" : "קובץ"} · {j.error ?? ""}
                  </li>
                ))}
              </ul>
              {isAdmin && failed.length > 0 && (
                <button onClick={() => act({ action: "retry_failed" }, () => setMsg("נוסה שוב"))} disabled={busy} className="text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800">
                  ניסיון חוזר לכל הכושלים
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {msg && <p className="text-xs text-neutral-500 mt-2">{msg}</p>}
    </section>
  );
}
