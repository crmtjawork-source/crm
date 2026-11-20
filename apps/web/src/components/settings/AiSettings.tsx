"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";

const field = "w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent";
const PROVIDERS: Array<{ id: string; label: string; hint: string }> = [
  { id: "", label: "לא מוגדר", hint: "" },
  { id: "soniox", label: "Soniox (מומלץ לעברית ושיחות ארוכות, מזהה דוברים)", hint: "קבצים עד 5 שעות ללא חיתוך." },
  { id: "openai", label: "OpenAI (gpt-4o-transcribe)", hint: "קבצים מעל ~24MB נחתכים אוטומטית בדפדפן." },
  { id: "groq", label: "Groq (whisper-large-v3, זול ומהיר)", hint: "קבצים מעל ~24MB נחתכים אוטומטית בדפדפן." },
  { id: "custom", label: "שרת מותאם תואם OpenAI (למשל מודל ivrit-ai)", hint: "נדרשת כתובת בסיס (…/v1) ושם מודל." },
  { id: "mock", label: "בדיקה — בלי תמלול אמיתי ובלי עלות", hint: "מחזיר תמלול לדוגמה, לבדיקת התהליך בלבד." },
];

type S = { sttProvider: string; sttBaseUrl: string; sttModel: string; llmModel: string; zoomAccountId: string; zoomClientId: string; has: { sttApiKey: boolean; llmApiKey: boolean; zoomClientSecret: boolean } };

// Transcription engine, summary model and Zoom app for "שיחה מוקלטת". Keys are write-only.
export function AiSettings({ isAdmin }: { isAdmin: boolean }) {
  const [s, setS] = useState<S | null>(null);
  const [keys, setKeys] = useState({ sttApiKey: "", llmApiKey: "", zoomClientSecret: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAdmin) apiGet<S>("/api/org/ai-settings").then(setS).catch(() => setMsg("טעינת ההגדרות נכשלה"));
  }, [isAdmin]);

  if (!isAdmin) return <p className="text-sm text-neutral-500">ההגדרות האלה זמינות למנהלים בלבד.</p>;
  if (!s) return <p className="text-sm text-neutral-400">{msg || "טוען…"}</p>;
  const set = (patch: Partial<S>) => setS({ ...s, ...patch });

  async function save() {
    if (!s) return;
    setBusy(true);
    setMsg("");
    try {
      const body: Record<string, string> = { sttProvider: s.sttProvider, sttBaseUrl: s.sttBaseUrl, sttModel: s.sttModel, llmModel: s.llmModel, zoomAccountId: s.zoomAccountId, zoomClientId: s.zoomClientId };
      for (const [k, v] of Object.entries(keys)) if (v.trim()) body[k] = v.trim();
      await apiPost("/api/org/ai-settings", body);
      setKeys({ sttApiKey: "", llmApiKey: "", zoomClientSecret: "" });
      setS(await apiGet<S>("/api/org/ai-settings"));
      setMsg("נשמר ✓");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "השמירה נכשלה");
    }
    setBusy(false);
  }

  const keyField = (name: keyof typeof keys, has: boolean, label: string) => (
    <label className="block text-sm">
      {label} {has && <span className="text-emerald-600 text-xs">✓ מוגדר</span>}
      <input type="password" autoComplete="off" value={keys[name]} onChange={(e) => setKeys({ ...keys, [name]: e.target.value })} placeholder={has ? "השאירו ריק כדי לא לשנות" : "הדביקו מפתח"} dir="ltr" className={`${field} mt-1`} />
    </label>
  );
  const provider = PROVIDERS.find((p) => p.id === s.sttProvider);

  return (
    <section className="mb-10 space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold mb-1">תמלול וסיכום שיחות (AI)</h2>
        <p className="text-sm text-neutral-500 leading-relaxed">מאפשר בכרטיס הליד &quot;שיחה מוקלטת&quot;: הדבקת קישור זום/דרייב או העלאת קובץ ← תמלול ← סיכום, החלטות ומשימות. המפתחות נשמרים רק בצד השרת ולא מוצגים שוב.</p>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">מנוע תמלול</h3>
        <select value={s.sttProvider} onChange={(e) => set({ sttProvider: e.target.value })} className={field}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {provider?.hint && <p className="text-xs text-neutral-500">{provider.hint}</p>}
        {s.sttProvider && s.sttProvider !== "mock" && keyField("sttApiKey", s.has.sttApiKey, "מפתח API של מנוע התמלול")}
        {s.sttProvider === "custom" && (
          <input value={s.sttBaseUrl} onChange={(e) => set({ sttBaseUrl: e.target.value })} placeholder="https://…/v1" dir="ltr" className={field} />
        )}
        {s.sttProvider && s.sttProvider !== "mock" && <input value={s.sttModel} onChange={(e) => set({ sttModel: e.target.value })} placeholder="שם מודל (ריק = ברירת מחדל של המנוע)" dir="ltr" className={field} />}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">סיכום (Claude)</h3>
        {keyField("llmApiKey", s.has.llmApiKey, "מפתח API של Anthropic")}
        <input value={s.llmModel} onChange={(e) => set({ llmModel: e.target.value })} placeholder="מודל (ריק = claude-sonnet-5-5)" dir="ltr" className={field} />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">זום (למשיכת הקלטה מקישור)</h3>
        <p className="text-xs text-neutral-500 leading-relaxed">ב-Zoom Marketplace יוצרים אפליקציית Server-to-Server OAuth עם ההרשאה <code dir="ltr">cloud_recording:read:list_user_recordings:admin</code> (או <code dir="ltr">recording:read:admin</code>). בלי זה אפשר להוריד את ההקלטה מזום ולהעלות כקובץ.</p>
        <input value={s.zoomAccountId} onChange={(e) => set({ zoomAccountId: e.target.value })} placeholder="Account ID" dir="ltr" className={field} />
        <input value={s.zoomClientId} onChange={(e) => set({ zoomClientId: e.target.value })} placeholder="Client ID" dir="ltr" className={field} />
        {keyField("zoomClientSecret", s.has.zoomClientSecret, "Client Secret")}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm disabled:opacity-50">
          {busy ? "שומר…" : "שמירה"}
        </button>
        {msg && <span className="text-sm text-neutral-500">{msg}</span>}
      </div>
    </section>
  );
}
