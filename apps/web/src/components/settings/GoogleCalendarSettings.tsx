"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { apiPost, ApiError } from "@/lib/api";

type Connection = { account_email: string | null; last_error: string | null };

const RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "היומן חובר ✓ — פגישות קרובות שלך יופיעו בו תוך דקה." },
  company_connected: { ok: true, text: "יומן החברה חובר ✓ — כל הפגישות הקרובות יופיעו בו תוך דקה." },
  denied: { ok: false, text: "החיבור בוטל בגוגל." },
  no_refresh: { ok: false, text: "גוגל לא נתן הרשאה קבועה. נסו שוב (ואם צריך, הסירו קודם את הגישה בהגדרות חשבון הגוגל)." },
  error: { ok: false, text: "החיבור נכשל. נסו שוב." },
};

export function GoogleCalendarSettings({ isAdmin = false }: { isAdmin?: boolean }) {
  const { session, membership } = useAuth();
  const params = useSearchParams();
  const result = RESULT[params.get("google") ?? ""];
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [company, setCompany] = useState<Connection | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function fetchConnection(userId: string) {
    return supabase.from("calendar_connections").select("account_email, last_error").eq("user_id", userId).eq("provider", "google").eq("kind", "personal").maybeSingle();
  }

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchConnection(session.user.id).then(({ data }) => alive && setConn(data ?? null));
    supabase
      .from("calendar_connections")
      .select("account_email, last_error")
      .eq("org_id", membership?.orgId ?? "")
      .eq("provider", "google")
      .eq("kind", "company")
      .maybeSingle()
      .then(({ data }) => alive && setCompany(data ?? null));
    return () => {
      alive = false;
    };
  }, [session, membership?.orgId]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const { url } = await apiPost<{ url: string }>("/api/integrations/google", { action: "start" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החיבור נכשל");
      setBusy(false);
    }
  }

  async function connectCompany() {
    setBusy(true);
    setError("");
    try {
      const { url } = await apiPost<{ url: string }>("/api/integrations/google", { action: "start_company" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החיבור נכשל");
      setBusy(false);
    }
  }

  async function disconnectCompany() {
    if (!confirm("לנתק את יומן החברה? פגישות חדשות לא יתווספו אליו (מה שכבר נכנס נשאר ביומן).")) return;
    await apiPost("/api/integrations/google", { action: "disconnect_company" });
    setCompany(null);
  }

  async function disconnect() {
    if (!confirm("לנתק את יומן הגוגל? פגישות חדשות לא יתווספו אליו.")) return;
    await apiPost("/api/integrations/google", { action: "disconnect" });
    setConn(null);
  }

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">יומן גוגל</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        פגישות שלך מה-CRM נכנסות אוטומטית ליומן הגוגל שלך — כולל שינוי שעה וביטול — עם שם הליד, הטלפון וקישור לכרטיס. כל אחד מחבר את
        היומן שלו.
      </p>
      {result && <p className={`text-sm mb-3 ${result.ok ? "text-emerald-600" : "text-amber-600"}`}>{result.text}</p>}
      {conn === undefined ? (
        <p className="text-sm text-neutral-400">בודק…</p>
      ) : conn ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-600">מחובר ✓</span>
          {conn.account_email && (
            <span className="text-neutral-500" dir="ltr">
              {conn.account_email}
            </span>
          )}
          <button onClick={disconnect} className="text-xs text-neutral-400 hover:text-red-500 ms-auto">
            ניתוק
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
        >
          {busy ? "מעביר לגוגל…" : "חיבור יומן גוגל"}
        </button>
      )}
      {conn?.last_error && <p className="text-xs text-red-500 mt-2">{conn.last_error}</p>}

      <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <h3 className="text-sm font-semibold mb-1">יומן החברה</h3>
        <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
          יומן גוגל משותף של העסק: כל פגישה ושיחה שנקבעות במערכת, אצל כל נציג, נכנסות אליו אוטומטית עם שם הנציג והליד — כולל שינוי שעה וביטול.
          מחברים פעם אחת, מחשבון הגוגל של החברה.
        </p>
        {company === undefined ? (
          <p className="text-sm text-neutral-400">בודק…</p>
        ) : company ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-emerald-600">מחובר ✓</span>
            {company.account_email && (
              <span className="text-neutral-500" dir="ltr">
                {company.account_email}
              </span>
            )}
            {isAdmin && (
              <button onClick={disconnectCompany} className="text-xs text-neutral-400 hover:text-red-500 ms-auto">
                ניתוק
              </button>
            )}
          </div>
        ) : isAdmin ? (
          <button onClick={connectCompany} disabled={busy} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 disabled:opacity-50">
            {busy ? "מעביר לגוגל…" : "חיבור יומן החברה"}
          </button>
        ) : (
          <p className="text-xs text-amber-600">רק מנהלים יכולים לחבר את יומן החברה.</p>
        )}
        {company?.last_error && <p className="text-xs text-red-500 mt-2">{company.last_error}</p>}
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </section>
  );
}
