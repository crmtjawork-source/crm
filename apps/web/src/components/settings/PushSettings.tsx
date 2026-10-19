"use client";

import { useEffect, useState } from "react";
import { apiPost, ApiError } from "@/lib/api";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

function detect(): Promise<State> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhone only offers push to a CRM added to the home screen.
    const ios = typeof navigator !== "undefined" && /iphone|ipad/i.test(navigator.userAgent);
    return Promise.resolve(ios ? "needs-install" : "unsupported");
  }
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => reg.pushManager.getSubscription())
    .then((sub) => (sub ? "on" : "off"));
}

export function PushSettings() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    detect().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
      const json = sub.toJSON();
      await apiPost("/api/push", { action: "subscribe", endpoint: json.endpoint, keys: json.keys });
      setState("on");
      await apiPost("/api/push", { action: "test" });
      setMessage("נשלחה התראת בדיקה — היא אמורה להופיע תוך כמה שניות.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "הפעלת ההתראות נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await apiPost("/api/push", { action: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setMessage("");
    await apiPost("/api/push", { action: "test" });
    setMessage("נשלחה התראת בדיקה.");
  }

  const btn = "px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 disabled:opacity-50";

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">התראות לנייד ולמחשב</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        התראה כשנכנס ליד חדש, כשליד משויך אליך, וכשליד שלך כותב בוואטסאפ. מפעילים בכל מכשיר בנפרד.
      </p>
      {state === "loading" && <p className="text-sm text-neutral-400">בודק…</p>}
      {state === "unsupported" && <p className="text-sm text-neutral-500">הדפדפן הזה לא תומך בהתראות. בנייד אנדרואיד — Chrome; באייפון — ראה למטה.</p>}
      {state === "needs-install" && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed bg-neutral-50 dark:bg-neutral-900 rounded-md p-3">
          באייפון התראות עובדות רק כשה-CRM מותקן במסך הבית: ב-Safari לוחצים על כפתור השיתוף ← &quot;הוספה למסך הבית&quot;, פותחים את
          ה-CRM מהאייקון החדש, ונכנסים שוב לכאן.
        </p>
      )}
      {state === "denied" && <p className="text-sm text-amber-600">ההתראות חסומות בדפדפן. צריך לאפשר אותן בהגדרות האתר בדפדפן, ואז לרענן.</p>}
      {state === "off" && (
        <button onClick={enable} disabled={busy || !VAPID} className={`${btn} bg-neutral-900 text-white dark:bg-white dark:text-neutral-900`}>
          {busy ? "מפעיל…" : "הפעלת התראות במכשיר הזה"}
        </button>
      )}
      {state === "on" && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-emerald-600">ההתראות פעילות במכשיר הזה ✓</span>
          <button onClick={test} className={btn}>
            שליחת בדיקה
          </button>
          <button onClick={disable} disabled={busy} className="text-xs text-neutral-400 hover:text-red-500">
            כיבוי
          </button>
        </div>
      )}
      {message && <p className="text-xs text-neutral-500 mt-2">{message}</p>}
    </section>
  );
}
