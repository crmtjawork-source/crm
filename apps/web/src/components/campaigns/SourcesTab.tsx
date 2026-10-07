"use client";

import { useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { PLATFORMS } from "@/lib/attribution";
import type { LeadSource } from "@/lib/types";

const input = "px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

const subscribe = () => () => {};
function useOrigin() {
  return useSyncExternalStore(subscribe, () => window.location.origin, () => "");
}

export function SourcesTab({ isAdmin }: { isAdmin: boolean }) {
  const { leadSources, campaigns, addLeadSource } = useStore();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [agency, setAgency] = useState("");
  const [campaignId, setCampaignId] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addLeadSource({ name: name.trim(), defaultPlatform: platform || undefined, defaultAgency: agency.trim() || undefined, defaultCampaignId: campaignId || undefined });
    setName("");
    setPlatform("");
    setAgency("");
    setCampaignId("");
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
        כתובת קליטה היא לינק שכל מערכת חיצונית יכולה לשלוח אליו לידים: סוכנות פרסום, טופסי לידים של Google Ads, Zapier / Make, דף
        נחיתה, וויקס, אלמנטור ועוד. כל ליד נכנס ישר ל-CRM עם המקור והקמפיין שלו, ומפעיל את האוטומציות של &quot;ליד חדש&quot;. מומלץ
        כתובת נפרדת לכל סוכנות או מערכת, כדי לדעת בדיוק מאיפה הגיע כל ליד.
      </p>

      {isAdmin ? (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 mb-6 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">שם (למשל: סוכנות AIR, דף נחיתה)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={input} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">פלטפורמה (אם לא נשלחת)</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
              <option value="">זיהוי אוטומטי</option>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">סוכנות</span>
            <input value={agency} onChange={(e) => setAgency(e.target.value)} className={`${input} w-32`} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">קמפיין (אם לא נשלח)</span>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={`${input} max-w-48`}>
              <option value="">—</option>
              {campaigns
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            + כתובת חדשה
          </button>
        </form>
      ) : (
        <p className="text-xs text-amber-600 mb-3">רק מנהלים יכולים ליצור כתובות קליטה.</p>
      )}

      {leadSources.length === 0 ? (
        <p className="text-sm text-neutral-400">עוד אין כתובות קליטה.</p>
      ) : (
        <ul className="space-y-3">
          {leadSources.map((s) => (
            <SourceRow key={s.id} source={s} isAdmin={isAdmin} />
          ))}
        </ul>
      )}

      <Instructions />
    </div>
  );
}

function SourceRow({ source, isAdmin }: { source: LeadSource; isAdmin: boolean }) {
  const { updateLeadSource, deleteLeadSource } = useStore();
  const origin = useOrigin();
  const url = `${origin}/api/public/leads/${source.token}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className={`border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 ${source.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-medium text-sm">{source.name}</span>
        {!source.active && <span className="text-xs px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">מושבת</span>}
        <span className="text-xs text-neutral-400 ms-auto">
          {source.receivedCount} לידים
          {source.lastReceivedAt && ` · אחרון ${new Date(source.lastReceivedAt).toLocaleString("he-IL")}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-neutral-50 dark:bg-neutral-900 rounded px-2 py-1.5 truncate" dir="ltr">
          {url}
        </code>
        <button onClick={copy} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 shrink-0">
          {copied ? "הועתק ✓" : "העתקה"}
        </button>
      </div>
      {isAdmin && (
        <div className="flex gap-3 mt-2 text-xs text-neutral-400">
          <button onClick={() => updateLeadSource(source.id, { active: !source.active })} className="hover:underline">
            {source.active ? "השבתה" : "הפעלה"}
          </button>
          <button
            onClick={() => confirm(`למחוק את "${source.name}"? מערכות ששולחות לכתובת הזו יפסיקו להכניס לידים.`) && deleteLeadSource(source.id)}
            className="hover:underline hover:text-red-500"
          >
            מחיקה
          </button>
        </div>
      )}
    </li>
  );
}

const SNIPPET = `<script>
// בדף הנחיתה: שולח את הטופס ל-CRM יחד עם נתוני ה-UTM מהכתובת
document.querySelector("form").addEventListener("submit", function (e) {
  e.preventDefault();
  var data = Object.fromEntries(new FormData(e.target));
  new URLSearchParams(location.search).forEach(function (v, k) { data[k] = v; });
  data.landing_page = location.href.split("?")[0];
  data.referrer = document.referrer;
  fetch("כתובת_הקליטה", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
});
</script>`;

const EXAMPLE = `{
  "name": "ישראל ישראלי",
  "phone": "050-1234567",
  "email": "israel@example.com",
  "campaign": "שם הקמפיין",
  "platform": "meta",
  "utm_source": "facebook",
  "budget": "1-2 מיליון"
}`;

function Instructions() {
  return (
    <details className="mt-6 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 text-sm">
      <summary className="font-medium cursor-pointer">איך מחברים?</summary>
      <div className="mt-3 space-y-4 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200">סוכנות / כל מערכת עם Webhook</p>
          <p>שולחים POST לכתובת, כ-JSON או כטופס רגיל. השדות מזוהים לבד (שם, טלפון, אימייל, קמפיין, utm_*, gclid/fbclid), וכל שדה נוסף נשמר כשדה מותאם בליד.</p>
          <pre className="mt-1 bg-neutral-50 dark:bg-neutral-900 rounded p-2 overflow-x-auto" dir="ltr">
            {EXAMPLE}
          </pre>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200">Google Ads — טופס לידים</p>
          <p>בטופס הלידים בקמפיין: Lead delivery ← Webhook. מדביקים את הכתובת בשדה Webhook URL, וב-Key כותבים כל מילה. לחיצה על &quot;Send test data&quot; תיצור ליד בדיקה מסומן.</p>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200">Zapier / Make</p>
          <p>מוסיפים שלב Webhooks (POST) עם הכתובת, ומעבירים את שדות הליד.</p>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200">דף נחיתה (HTML, וויקס, אלמנטור)</p>
          <p>אפשר להגדיר בטופס &quot;Webhook&quot; עם הכתובת, או להוסיף קוד ששולח גם את נתוני ה-UTM:</p>
          <pre className="mt-1 bg-neutral-50 dark:bg-neutral-900 rounded p-2 overflow-x-auto" dir="ltr">
            {SNIPPET}
          </pre>
        </div>
        <p>טופסי לידים של פייסבוק ואינסטגרם מתחברים ישירות בהגדרות ← אינטגרציות, ושם הקמפיין והמודעה נשמרים אוטומטית.</p>
      </div>
    </details>
  );
}
