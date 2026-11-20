"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import { apiGet, apiPost } from "@/lib/api";
import { fmtDate, type Row } from "@/lib/payments";

type Draft = { description: string; amount: string; dueDate: string; condition: string };
type Extraction = { title: string; summary: string; totalAmount: number | null; currency: string; items: { description: string; amount: number | null; dueDate: string | null; condition: string | null }[]; warnings: string[] };
type Settings = { days: number[]; createTasks: boolean; aiConfigured: boolean };

const MAX = 20 * 1024 * 1024;
const field = "w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm";

// Add a payment schedule to a lead: pick / upload the contract, let AI read it, REVIEW and edit
// every row, then confirm — only then are the payments, reminders and tasks created.
export function ScheduleWizard({ contactId: presetContact, onClose, onDone }: { contactId?: string; onClose: () => void; onDone: () => void }) {
  const { contacts, opportunities, orgId } = useStore();
  const [contactId, setContactId] = useState(presetContact ?? "");
  const [query, setQuery] = useState("");
  const defaultDeal = (id: string) => opportunities.find((o) => o.contactId === id && o.status === "open")?.id ?? "";
  const [oppId, setOppId] = useState(() => (presetContact ? defaultDeal(presetContact) : ""));
  const [files, setFiles] = useState<Row[]>([]);
  const [fileId, setFileId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"source" | "review">("source");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [rows, setRows] = useState<Draft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ai, setAi] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  const contact = contacts.find((c) => c.id === contactId);
  const deals = opportunities.filter((o) => o.contactId === contactId);

  useEffect(() => {
    apiGet<Settings>("/api/payments/settings").then(setSettings).catch(() => {});
  }, []);
  useEffect(() => {
    if (!contactId) return;
    supabase.from("files").select("id, name, mime, size, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).then(({ data }) => setFiles(data ?? []));
  }, [contactId]);
  function pick(id: string) {
    setContactId(id);
    setOppId(defaultDeal(id));
    setFileId("");
  }

  const matches = query.trim() ? contacts.filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];

  async function upload(list: FileList | null) {
    const file = list?.[0];
    if (!file || !contactId) return;
    if (file.size > MAX) return setError("הקובץ גדול מ-20MB");
    setBusy("מעלה את החוזה…");
    setError("");
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
    const path = `${orgId}/${crypto.randomUUID()}${ext}`;
    const up = await supabase.storage.from("files").upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setBusy("");
      return setError(up.error.message);
    }
    const { data, error: e } = await supabase.from("files").insert({ org_id: orgId, contact_id: contactId, name: file.name, path, size: file.size, mime: file.type || null }).select("id, name, mime, size, created_at").single();
    setBusy("");
    if (e || !data) return setError(e?.message ?? "העלאה נכשלה");
    setFiles((f) => [data, ...f]);
    setFileId(data.id);
  }

  async function read() {
    setBusy("ה-AI קורא את החוזה… (עד דקה)");
    setError("");
    try {
      const r = await apiPost<Extraction>("/api/payments/extract", { fileId });
      setTitle(r.title);
      setSummary(r.summary);
      setTotal(r.totalAmount == null ? "" : String(r.totalAmount));
      setCurrency(r.currency || "ILS");
      setRows(r.items.map((i) => ({ description: i.description, amount: i.amount == null ? "" : String(i.amount), dueDate: i.dueDate ?? "", condition: i.condition ?? "" })));
      setWarnings(r.warnings);
      setAi(true);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "הקריאה נכשלה");
    }
    setBusy("");
  }

  function manual() {
    setTitle(contact ? `לוח תשלומים — ${contact.name}` : "");
    setRows([{ description: "", amount: "", dueDate: "", condition: "" }]);
    setAi(false);
    setStep("review");
  }

  const setRow = (i: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  async function confirm() {
    const items = rows.filter((r) => r.description.trim());
    if (!items.length) return setError("יש להזין לפחות תשלום אחד");
    setBusy("שומר ויוצר תזכורות…");
    setError("");
    try {
      await apiPost("/api/payments/schedules", {
        contactId,
        opportunityId: oppId || null,
        fileId: fileId || null,
        title,
        summary,
        totalAmount: total === "" ? null : Number(total),
        currency,
        aiExtracted: ai,
        items: items.map((r) => ({ description: r.description, amount: r.amount === "" ? null : Number(r.amount), dueDate: r.dueDate || null, condition: r.condition || null })),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "השמירה נכשלה");
      setBusy("");
    }
  }

  const days = settings?.days ?? [7, 1];
  const body = (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      <button aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 border border-black/[.06] dark:border-white/10 shadow-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">{step === "source" ? "לוח תשלומים חדש" : "בדיקה ואישור — שום דבר לא נוצר עד שתאשר"}</h2>
          <button onClick={onClose} className="text-neutral-400 text-lg px-2" aria-label="סגירה">×</button>
        </div>

        {step === "source" && (
          <div className="space-y-4">
            {!presetContact && (
              <div>
                <span className="block text-xs text-neutral-500 mb-1">ליד / לקוח</span>
                {contact ? (
                  <div className="flex items-center gap-2 text-sm">
                    <b>{contact.name}</b>
                    <button onClick={() => (pick(""), setQuery(""))} className="text-xs text-neutral-400 underline">החלפה</button>
                  </div>
                ) : (
                  <div>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם או טלפון" className={field} autoFocus />
                    {matches.length > 0 && (
                      <ul className="mt-1 rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
                        {matches.map((c) => (
                          <li key={c.id}>
                            <button onClick={() => pick(c.id)} className="w-full text-start px-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800">
                              {c.name} <span className="text-xs text-neutral-400">{c.phone}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            {contactId && (
              <>
                {deals.length > 0 && (
                  <label className="block text-sm">
                    <span className="block text-xs text-neutral-500 mb-1">עסקה</span>
                    <select value={oppId} onChange={(e) => setOppId(e.target.value)} className={field}>
                      <option value="">ללא קישור לעסקה</option>
                      {deals.map((d) => (
                        <option key={d.id} value={d.id}>{d.title}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div>
                  <span className="block text-xs text-neutral-500 mb-1">החוזה (נשמר בקבצים של הליד)</span>
                  {files.length > 0 && (
                    <select value={fileId} onChange={(e) => setFileId(e.target.value)} className={`${field} mb-2`}>
                      <option value="">בחירת קובץ קיים של הליד…</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} · {fmtDate(String(f.created_at).slice(0, 10))}</option>
                      ))}
                    </select>
                  )}
                  <label className="inline-block text-xs px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 cursor-pointer">
                    + העלאת חוזה חדש (PDF / תמונה / סריקה)
                    <input type="file" accept="application/pdf,image/*" className="hidden" disabled={Boolean(busy)} onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button disabled={!fileId || Boolean(busy) || settings?.aiConfigured === false} onClick={read} className="px-3 py-1.5 text-sm rounded-md bg-tint text-white disabled:opacity-40">
                    ✨ קריאת החוזה עם AI
                  </button>
                  <button disabled={Boolean(busy)} onClick={manual} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
                    מילוי ידני
                  </button>
                </div>
                {settings?.aiConfigured === false && <p className="text-xs text-amber-600">קריאת AI עדיין לא הופעלה במערכת (חסר מפתח Claude בשרת) — אפשר למלא ידנית.</p>}
              </>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            {ai && <p className="text-xs rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 p-2">הנתונים נקראו אוטומטית מהחוזה וייתכנו טעויות. יש לבדוק כל תאריך וסכום מול החוזה ורק אז לאשר.</p>}
            {warnings.length > 0 && (
              <ul className="text-xs rounded-lg bg-red-500/10 text-red-600 p-2 list-disc ps-5 space-y-0.5">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-sm sm:col-span-2"><span className="block text-xs text-neutral-500 mb-1">כותרת</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
              <div className="flex gap-2">
                <label className="text-sm flex-1"><span className="block text-xs text-neutral-500 mb-1">סה״כ עסקה</span><input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className={field} /></label>
                <label className="text-sm w-20"><span className="block text-xs text-neutral-500 mb-1">מטבע</span>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}><option value="ILS">₪</option><option value="USD">$</option><option value="EUR">€</option></select>
                </label>
              </div>
            </div>
            <label className="block text-sm"><span className="block text-xs text-neutral-500 mb-1">סיכום החוזה</span><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className={field} /></label>

            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[1fr_7rem_9rem_1fr_1.5rem] gap-2 text-xs text-neutral-500"><span>תיאור התשלום</span><span>סכום</span><span>תאריך</span><span>תנאי (כשאין תאריך)</span><span /></div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_7rem_9rem_1fr_1.5rem] gap-2 items-center">
                  <input value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="תיאור" className={`${field} col-span-2 sm:col-span-1`} />
                  <input type="number" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} placeholder="סכום" className={field} />
                  <input type="date" value={r.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} className={field} />
                  <input value={r.condition} onChange={(e) => setRow(i, { condition: e.target.value })} placeholder="למשל: במסירה" className={`${field} col-span-2 sm:col-span-1`} />
                  <button onClick={() => setRows((rs) => rs.filter((_, x) => x !== i))} className="text-neutral-300 hover:text-red-500" aria-label="מחיקת שורה">×</button>
                </div>
              ))}
              <button onClick={() => setRows((rs) => [...rs, { description: "", amount: "", dueDate: "", condition: "" }])} className="text-xs px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800">+ שורה</button>
              <p className="text-xs text-neutral-500">סכום השורות: <b>{sum.toLocaleString("he-IL")}</b>{total !== "" && Number(total) !== sum && <span className="text-amber-600"> · שונה מסה״כ העסקה ({Number(total).toLocaleString("he-IL")})</span>}</p>
            </div>

            <p className="text-xs text-neutral-500 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2">
              בעת האישור ייווצרו תזכורת {settings?.createTasks === false ? "" : "ומשימה "}
              {days.map((d) => (d === 0 ? "ביום התשלום" : `${d} ימים לפני`)).join(" ו-")} כל תאריך תשלום, ויופעלו אוטומציות מסוג &quot;תזכורת תשלום&quot; אם הוגדרו. (אפשר לשנות בהגדרות ← לוח תשלומים.) תשלומים בלי תאריך לא יקבלו תזכורות עד שיוזן תאריך.
            </p>
            <div className="flex gap-2 pt-1">
              <button disabled={Boolean(busy)} onClick={confirm} className="px-3 py-1.5 text-sm rounded-md bg-tint text-white disabled:opacity-40">אישור ויצירת לוח תשלומים</button>
              <button onClick={() => setStep("source")} className="px-3 py-1.5 text-sm text-neutral-400">חזרה</button>
            </div>
          </div>
        )}
        {busy && <p className="text-xs text-neutral-500 mt-3">{busy}</p>}
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
