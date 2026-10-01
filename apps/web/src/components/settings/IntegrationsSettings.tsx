"use client";

import { useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { apiPost, ApiError } from "@/lib/api";
import type { Channel } from "@/lib/types";
import { EmbeddedSignupPanel } from "./EmbeddedSignupPanel";

function historySyncOpen(channel: Channel): boolean {
  if (channel.onboarding !== "coexistence" || channel.historySyncRequestedAt || !channel.onboardedAt) return false;
  return Date.now() - new Date(channel.onboardedAt).getTime() < 24 * 60 * 60 * 1000;
}

const inputClass = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <p className="text-sm text-neutral-500 mb-4">{description}</p>
      {children}
    </section>
  );
}

const noopSubscribe = () => () => {};

function WebhookInfo() {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  const url = `${origin}/api/webhooks/meta`;
  return (
    <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 p-3 text-sm space-y-1">
      <p className="text-xs text-neutral-500">Callback URL להגדרה באפליקציה של מטא (WhatsApp וגם Page):</p>
      <p className="font-mono text-xs break-all" dir="ltr">
        {url}
      </p>
      <p className="text-xs text-neutral-400">
        ה-Verify token נמצא במשתנה הסביבה META_WEBHOOK_VERIFY_TOKEN בשרת. כתובת localhost לא תעבוד — מטא צריכים כתובת ציבורית ב-HTTPS.
      </p>
    </div>
  );
}

function ChannelRow({ channel, canManage }: { channel: Channel; canManage: boolean }) {
  const { reloadIntegrations } = useStore();
  const [editingToken, setEditingToken] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retryHistorySync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiPost<{ notes: string[] }>("/api/whatsapp/sync-history", { channelId: channel.id });
      await reloadIntegrations();
      setMessage(res.notes?.join(" · ") || "בוצע");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "הסנכרון נכשל");
    } finally {
      setBusy(false);
    }
  }

  async function save(patch: { isDefault?: boolean; active?: boolean; accessToken?: string }) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiPost<{ notes: string[] }>("/api/channels", { id: channel.id, ...patch });
      await reloadIntegrations();
      setEditingToken(false);
      setToken("");
      setMessage(res.notes?.length ? res.notes.join(" · ") : "נשמר");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border border-neutral-200 dark:border-neutral-800 rounded-md px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-medium">{channel.name}</span>
          {channel.isDefault && <span className="ms-2 text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">ברירת מחדל</span>}
          {!channel.active && <span className="ms-2 text-[11px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800">מושבת</span>}
          {channel.onboarding === "coexistence" && (
            <span className="ms-2 text-[11px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200">גם באפליקציה בטלפון</span>
          )}
          <p className="text-xs text-neutral-500" dir="ltr">
            {channel.displayPhone ?? ""} · ID {channel.externalId}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-3 text-xs shrink-0">
            {!channel.isDefault && (
              <button disabled={busy} onClick={() => save({ isDefault: true })} className="text-neutral-500 hover:underline">
                הגדר כברירת מחדל
              </button>
            )}
            <button disabled={busy} onClick={() => save({ active: !channel.active })} className="text-neutral-500 hover:underline">
              {channel.active ? "השבתה" : "הפעלה"}
            </button>
            <button onClick={() => setEditingToken((v) => !v)} className="text-neutral-500 hover:underline">
              החלפת טוקן
            </button>
          </div>
        )}
      </div>
      {channel.onboarding === "coexistence" && (
        <p className="text-xs text-neutral-500 mt-1">
          {channel.historySyncRequestedAt ? (
            "סנכרון היסטוריית השיחות התבקש ממטא"
          ) : historySyncOpen(channel) ? (
            <>
              סנכרון ההיסטוריה עוד לא התחיל.{" "}
              {canManage && (
                <button disabled={busy} onClick={retryHistorySync} className="underline">
                  להתחיל עכשיו
                </button>
              )}
            </>
          ) : (
            "חלון 24 השעות לסנכרון היסטוריה עבר"
          )}
        </p>
      )}
      {editingToken && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) save({ accessToken: token.trim() });
          }}
          className="flex gap-2 mt-2"
        >
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="טוקן חדש" dir="ltr" className={inputClass} />
          <button disabled={busy} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 shrink-0">
            שמירה
          </button>
        </form>
      )}
      {message && <p className="text-xs text-neutral-500 mt-1">{message}</p>}
    </li>
  );
}

function AddChannelForm() {
  const { reloadIntegrations, channels } = useStore();
  const [name, setName] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isDefault, setIsDefault] = useState(channels.length === 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiPost<{ notes: string[] }>("/api/channels", {
        name,
        phoneNumberId,
        wabaId,
        accessToken,
        isDefault,
      });
      await reloadIntegrations();
      setName("");
      setPhoneNumberId("");
      setWabaId("");
      setAccessToken("");
      setMessage(["המספר חובר", ...(res.notes ?? [])].join(" · "));
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "החיבור נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md p-3">
      <p className="text-xs font-semibold text-neutral-500">חיבור מספר חדש</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder='שם לתצוגה (למשל "מספר רשמי" או "חוליאן")' className={inputClass} />
      <div className="flex gap-2">
        <input
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="Phone number ID"
          required
          dir="ltr"
          className={inputClass}
        />
        <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID" dir="ltr" className={inputClass} />
      </div>
      <input
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
        placeholder="System User access token (קבוע)"
        type="password"
        required
        dir="ltr"
        className={inputClass}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        מספר ברירת מחדל (ממנו יוצאות הודעות כשלא נבחר מספר אחר)
      </label>
      <button disabled={busy} className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50">
        {busy ? "בודק מול מטא…" : "חיבור"}
      </button>
      {message && <p className="text-xs text-neutral-500">{message}</p>}
    </form>
  );
}

function ConnectPageForm() {
  const { reloadIntegrations } = useStore();
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiPost("/api/lead-pages", { pageId, pageAccessToken });
      await reloadIntegrations();
      setPageId("");
      setPageAccessToken("");
      setMessage("הדף חובר — לידים חדשים מהטפסים ייכנסו אוטומטית");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "החיבור נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md p-3">
      <p className="text-xs font-semibold text-neutral-500">חיבור דף פייסבוק</p>
      <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="Page ID" required dir="ltr" className={inputClass} />
      <input
        value={pageAccessToken}
        onChange={(e) => setPageAccessToken(e.target.value)}
        placeholder="Page access token (עם leads_retrieval)"
        type="password"
        required
        dir="ltr"
        className={inputClass}
      />
      <button disabled={busy} className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50">
        {busy ? "בודק מול מטא…" : "חיבור"}
      </button>
      {message && <p className="text-xs text-neutral-500">{message}</p>}
    </form>
  );
}

export function IntegrationsSettings() {
  const { channels, leadAdPages } = useStore();
  const { membership } = useAuth();
  const canManage = membership?.role === "owner" || membership?.role === "admin";

  return (
    <>
      <Section
        title="ערוצי וואטסאפ"
        description="מספרי WhatsApp Business (Cloud API) שמחוברים למערכת. הודעות נכנסות ויוצאות מכל המספרים מופיעות במסך השיחות."
      >
        <ul className="space-y-2 mb-3">
          {channels.map((ch) => (
            <ChannelRow key={ch.id} channel={ch} canManage={canManage} />
          ))}
          {channels.length === 0 && <p className="text-sm text-neutral-400">עוד לא חובר מספר.</p>}
        </ul>
        {canManage ? (
          <div className="space-y-3">
            <EmbeddedSignupPanel />
            <details>
              <summary className="text-xs text-neutral-500 cursor-pointer">חיבור ידני עם מזהים וטוקן (מתקדם)</summary>
              <div className="mt-2">
                <AddChannelForm />
              </div>
            </details>
          </div>
        ) : (
          <p className="text-xs text-neutral-400">רק מנהלים יכולים לחבר מספרים.</p>
        )}
      </Section>

      <Section
        title="טפסי לידים של פייסבוק / אינסטגרם"
        description="כל ליד שממלא טופס בפרסומת בדף מחובר נכנס אוטומטית כליד חדש, כולל כל התשובות שלו, ומפעיל את אוטומציות 'ליד חדש נוצר'."
      >
        <ul className="space-y-2 mb-3">
          {leadAdPages.map((p) => (
            <li key={p.id} className="border border-neutral-200 dark:border-neutral-800 rounded-md px-3 py-2 text-sm">
              <span className="font-medium">{p.pageName ?? "דף"}</span>
              <span className="text-xs text-neutral-500 ms-2" dir="ltr">
                {p.pageId}
              </span>
            </li>
          ))}
          {leadAdPages.length === 0 && <p className="text-sm text-neutral-400">עוד לא חובר דף.</p>}
        </ul>
        {canManage ? <ConnectPageForm /> : <p className="text-xs text-neutral-400">רק מנהלים יכולים לחבר דפים.</p>}
      </Section>

      {canManage && (
        <Section title="Webhook" description="הכתובת שאליה מטא שולחים הודעות וואטסאפ ולידים מטפסים.">
          <WebhookInfo />
        </Section>
      )}
    </>
  );
}
