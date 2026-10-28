"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";
import { useMyGateway } from "@/lib/useMyGateway";
import type { Channel } from "@/lib/types";

const field = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

const STATE_LABELS: Record<string, string> = {
  authorized: "מחובר ✓",
  notAuthorized: "ממתין לסריקת קוד",
  blocked: "חסום על ידי וואטסאפ",
  sleepMode: "הטלפון כבוי או לא מחובר לאינטרנט",
  starting: "מתחבר…",
  yellowCard: "הוגבל זמנית על ידי וואטסאפ — להאט את השליחה",
};

export function PersonalWhatsAppSettings({ isAdmin }: { isAdmin: boolean }) {
  const { channels, members, reloadIntegrations } = useStore();
  const { channel } = useMyGateway();
  const linked = channels.filter((c) => c.provider === "green_api" || c.provider === "evolution");
  const business = linked.filter((c) => !c.ownerMembershipId && c.active);
  const others = linked.filter((c) => c.ownerMembershipId && c.id !== channel?.id);
  const ownerName = (c: Channel) => members.find((m) => m.id === `mem:${c.ownerMembershipId}`)?.name ?? "—";

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">הוואטסאפ שלי</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        מחברים את הוואטסאפ שלך פעם אחת (סריקת קוד, כמו וואטסאפ ווב). כל השיחות שלך מופיעות במסך &quot;וואטסאפ אישי&quot; כמו בוואטסאפ ווב —
        שיחות רגילות, קבוצות ותמונות, כולל ההיסטוריה של 30 הימים האחרונים. השיחות פרטיות: רק אתה רואה אותן, גם מנהלים לא. ההודעות מהכפתורים
        בכרטיס הליד (ללא מענה, אישור פגישה, תזכורות) נשלחות לבד מהמספר שלך.
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-md p-2 mb-4 leading-relaxed">
        זה חיבור לא רשמי (כמו וואטסאפ ווב). וואטסאפ עלולה לחסום מספר ששולח הרבה הודעות אוטומטיות לאנשים שלא שמרו אותו — כדאי להתחיל
        בנפח קטן.
      </p>

      {channel ? <Connected channel={channel} onChange={reloadIntegrations} /> : <ConnectForm onDone={reloadIntegrations} />}

      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-1">מספר העסק</h3>
        <p className="text-xs text-neutral-500 mb-2 leading-relaxed">
          מספר משותף לכל הצוות: כל אחד יכול לשלוח ממנו מכרטיס הליד (בחירה בין &quot;הוואטסאפ שלי&quot; ל&quot;מספר העסק&quot;), והוא משמש
          להודעות לעסק כולו — וולקאם, תזכורות ולידים בלי בעלים.
        </p>
        {business.length > 0 ? (
          <div className="space-y-2">
            {business.map((c) => (
              <Connected key={c.id} channel={c} onChange={reloadIntegrations} />
            ))}
          </div>
        ) : (
          <ConnectForm onDone={reloadIntegrations} shared />
        )}
        {business.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-neutral-500 cursor-pointer">חיבור מספר עסק נוסף</summary>
            <div className="mt-2">
              <ConnectForm onDone={reloadIntegrations} shared />
            </div>
          </details>
        )}
      </div>

      {isAdmin && others.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-neutral-500 mb-2">חיבורים של הצוות</p>
          <ul className="space-y-1 text-sm">
            {others.map((c) => (
              <li key={c.id} className="flex items-center justify-between border border-neutral-200 dark:border-neutral-800 rounded-md px-3 py-1.5">
                <span>
                  {ownerName(c)} <span className="text-neutral-400" dir="ltr">{c.displayPhone ? `+${c.displayPhone}` : ""}</span>
                </span>
                <span className="text-xs text-neutral-500">{!c.active ? "מנותק" : STATE_LABELS[c.status ?? ""] ?? c.status ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ConnectForm({ onDone, shared }: { onDone: () => Promise<void>; shared?: boolean }) {
  // The platform's own WhatsApp server (Evolution) → one click; otherwise
  // the member brings a Green-API instance.
  const [evolution, setEvolution] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    apiPost<{ evolution: boolean }>("/api/channels/gateway", { action: "config" })
      .then((r) => alive && setEvolution(r.evolution))
      .catch(() => alive && setEvolution(false));
    return () => {
      alive = false;
    };
  }, []);
  const [idInstance, setIdInstance] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [apiUrl, setApiUrl] = useState("https://api.green-api.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connectEvolution() {
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/channels/gateway", { action: "connect_evolution", shared });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החיבור נכשל");
    } finally {
      setBusy(false);
    }
  }

  if (evolution === null) return <p className="text-sm text-neutral-400">בודק…</p>;
  if (evolution) {
    return (
      <div className="space-y-2">
        <button onClick={connectEvolution} disabled={busy} className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50">
          {busy ? "מכין…" : shared ? "חיבור מספר העסק" : "חיבור הוואטסאפ שלי"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/channels/gateway", { action: "connect", idInstance, apiToken, apiUrl });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החיבור נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
      <p className="text-xs text-neutral-500 leading-relaxed">
        ב-<span dir="ltr">console.green-api.com</span> יוצרים Instance, ומעתיקים לכאן את שלושת הפרטים שמופיעים בו.
      </p>
      <label className="block text-xs">
        <span className="block text-neutral-500 mb-1">idInstance</span>
        <input value={idInstance} onChange={(e) => setIdInstance(e.target.value)} dir="ltr" required className={field} />
      </label>
      <label className="block text-xs">
        <span className="block text-neutral-500 mb-1">apiTokenInstance</span>
        <input value={apiToken} onChange={(e) => setApiToken(e.target.value)} dir="ltr" required type="password" autoComplete="off" className={field} />
      </label>
      <label className="block text-xs">
        <span className="block text-neutral-500 mb-1">apiUrl</span>
        <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} dir="ltr" className={field} />
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button type="submit" disabled={busy} className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50">
        {busy ? "מתחבר…" : "המשך לסריקת קוד"}
      </button>
    </form>
  );
}

export function Connected({ channel, onChange }: { channel: Channel; onChange: () => Promise<void> }) {
  const [state, setState] = useState(channel.status ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await apiPost<{ state: string; qr: string | null }>("/api/channels/gateway", { action: "status", id: channel.id });
      setState(r.state);
      setQr(r.qr);
      setError("");
      return r.state;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "בדיקת המצב נכשלה");
      return null;
    }
  }, [channel.id]);

  // While waiting for the scan, refresh the QR (it rotates) every few seconds.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const s = await refresh();
      if (stop) return;
      if (s === "authorized") {
        await onChange();
        return;
      }
      timer = setTimeout(tick, 4000);
    }
    if (channel.status !== "authorized") tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [channel.status, refresh, onChange]);

  // WhatsApp only sends history when a device is newly linked: log out and scan again.
  async function relinkForHistory() {
    if (!confirm("לקבל את ההיסטוריה של 30 הימים האחרונים? הוואטסאפ ינותק ויופיע קוד חדש שצריך לסרוק מהטלפון.")) return;
    try {
      await apiPost("/api/channels/gateway", { action: "connect_evolution", shared: !channel.ownerMembershipId, fresh: true });
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החיבור מחדש נכשל");
    }
  }

  async function disconnect() {
    if (!confirm(channel.ownerMembershipId ? "לנתק את הוואטסאפ שלך מהמערכת? ההודעות האוטומטיות יפסיקו להישלח." : "לנתק את מספר העסק? הוולקאם, התזכורות וההודעות ממספר העסק יפסיקו להישלח.")) return;
    await apiPost("/api/channels/gateway", { action: "disconnect", id: channel.id });
    await onChange();
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span>
          {channel.displayPhone ? <span dir="ltr">+{channel.displayPhone}</span> : channel.ownerMembershipId ? "הוואטסאפ שלי" : "מספר העסק"} ·{" "}
          <span className={state === "authorized" ? "text-emerald-600" : "text-amber-600"}>{STATE_LABELS[state] ?? state ?? "—"}</span>
        </span>
        <span className="flex gap-3">
          {channel.provider === "evolution" && channel.ownerMembershipId && (
            <button onClick={relinkForHistory} className="text-xs text-neutral-500 hover:underline">
              סנכרון היסטוריה (30 ימים)
            </button>
          )}
          <button onClick={disconnect} className="text-xs text-neutral-400 hover:text-red-500">
            ניתוק
          </button>
        </span>
      </div>
      {qr && (
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${qr}`} alt="קוד QR לחיבור וואטסאפ" className="mx-auto w-56 h-56" />
          <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
            בטלפון: וואטסאפ ← הגדרות ← מכשירים מקושרים ← קישור מכשיר, וסורקים את הקוד.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// Compact link controls for the WhatsApp screen itself: reconnect (log out and
// scan again — also what fetches the 30-day history) or disconnect.
export function LinkControls({ channel, onChange }: { channel: Channel; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function relink() {
    if (!confirm("לחבר מחדש? הוואטסאפ ינותק ויופיע קוד חדש לסריקה מהטלפון — כך מתקבלת גם ההיסטוריה של 30 הימים האחרונים.")) return;
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/channels/gateway", { action: "connect_evolution", shared: !channel.ownerMembershipId, fresh: true });
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החיבור מחדש נכשל");
    }
    setBusy(false);
  }

  async function syncList() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ chats: number; unread: number }>("/api/channels/gateway", { action: "sync_chats", id: channel.id });
      setError(r.chats ? `נטענו ${r.chats} שיחות, ${r.unread} עם הודעות שלא נקראו.` : "השרת עוד לא שומר רשימת שיחות — צריך להפעיל שמירה בשרת וחיבור מחדש.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הרענון נכשל");
    }
    setBusy(false);
  }

  async function disconnect() {
    if (!confirm("להתנתק מהוואטסאפ? ההודעות יפסיקו להיכנס עד שתחבר שוב.")) return;
    setBusy(true);
    await apiPost("/api/channels/gateway", { action: "disconnect", id: channel.id }).catch(() => undefined);
    await onChange();
    setBusy(false);
  }

  return (
    <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 text-xs flex items-center gap-3 flex-wrap">
      <span className={channel.status === "authorized" ? "text-emerald-600" : "text-amber-600"}>{channel.status === "authorized" ? "מחובר ✓" : "לא מחובר"}</span>
      {channel.displayPhone && (
        <span className="text-neutral-500" dir="ltr">
          +{channel.displayPhone}
        </span>
      )}
      <span className="ms-auto flex gap-3">
        <button onClick={syncList} disabled={busy} className="text-neutral-600 dark:text-neutral-300 hover:underline disabled:opacity-50" title="מושך מהשרת את רשימת השיחות ואת מונה ההודעות שלא נקראו">
          רענון רשימה
        </button>
        <button onClick={relink} disabled={busy} className="text-neutral-600 dark:text-neutral-300 hover:underline disabled:opacity-50">
          חיבור מחדש
        </button>
        <button onClick={disconnect} disabled={busy} className="text-neutral-400 hover:text-red-500 disabled:opacity-50">
          התנתקות
        </button>
      </span>
      {error && <span className={`w-full ${error.startsWith("נטענו") ? "text-emerald-600" : "text-red-500"}`}>{error}</span>}
    </div>
  );
}
