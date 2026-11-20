"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/lib/store";
import { confirmAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import type { CrmRecord, ObjectType } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Types that may appear on a public page (mirrors lib/server/shares.ts).
const SHAREABLE = ["text", "long_text", "number", "currency", "date", "datetime", "select", "multi_select", "checkbox", "url"];
// Off by default: opt-in only, they are often internal.
const OPT_IN = ["currency"];

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
const isImg = (f: Row) => (f.mime ?? "").startsWith("image/") && !/svg/.test(f.mime);
const input = "w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent";

// "שיתוף עם לקוח": build / manage the public page of a record — pick fields and
// files, publish / unpublish, regenerate the link, expiry, branding — and hand
// the link to WhatsApp (prefilled, never auto-sent).
export function ShareSheet({ record, type, onClose, onWhatsApp }: { record: CrmRecord; type: ObjectType; onClose: () => void; onWhatsApp?: (text: string) => void }) {
  const { orgId, members, currentMemberId } = useStore();
  const isAdmin = ["owner", "admin"].includes(members.find((m) => m.id === currentMemberId)?.role ?? "");
  const [share, setShare] = useState<Row | null | undefined>(undefined);
  const [files, setFiles] = useState<Row[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [expires, setExpires] = useState("");
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [brand, setBrand] = useState<Row>({});
  const [brandOpen, setBrandOpen] = useState(false);

  const fields = useMemo(() => type.fields.filter((f) => SHAREABLE.includes(f.type) && f.key !== type.stageField), [type]);
  const link = share ? `${window.location.origin}/s/${share.token}` : "";

  const fill = useCallback((s: Row) => {
    setShare(s);
    setTitle(s.title ?? "");
    setIntro(s.intro ?? "");
    setKeys(s.field_keys ?? []);
    setFileIds(s.file_ids ?? []);
    setExpires(s.expires_at ? String(s.expires_at).slice(0, 10) : "");
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: fl }, { data: org }] = await Promise.all([
        supabase.from("record_shares").select("*").eq("record_id", record.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("files").select("*").eq("record_id", record.id).order("position").order("created_at"),
        supabase.from("organizations").select("share_brand").eq("id", orgId).maybeSingle(),
      ]);
      setFiles(fl ?? []);
      setBrand(org?.share_brand ?? {});
      if (s) fill(s);
      else setShare(null);
      const imgs = (fl ?? []).filter(isImg);
      if (imgs.length) {
        const { data } = await supabase.storage.from("files").createSignedUrls(imgs.map((f) => f.path), 1800);
        setThumbs(Object.fromEntries((data ?? []).map((d, i) => [imgs[i].id, d.signedUrl ?? ""])));
      }
    })();
  }, [record.id, orgId, fill]);

  async function create() {
    setBusy(true);
    const imgs = files.filter(isImg).map((f) => f.id);
    const defaults = fields.filter((f) => !OPT_IN.includes(f.type) && record.data[f.key] !== undefined && record.data[f.key] !== "").map((f) => f.key);
    const { data, error } = await supabase
      .from("record_shares")
      .insert({ org_id: orgId, record_id: record.id, token: newToken(), field_keys: defaults, file_ids: imgs, title: null })
      .select()
      .single();
    setBusy(false);
    if (error) return setMsg(error.message);
    fill(data);
  }

  async function save(patch: Row = {}) {
    if (!share) return null;
    setBusy(true);
    const { data, error } = await supabase
      .from("record_shares")
      .update({ title: title.trim() || null, intro: intro.trim() || null, field_keys: keys, file_ids: [...fileIds].sort((a, b) => files.findIndex((f) => f.id === a) - files.findIndex((f) => f.id === b)), expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null, ...patch })
      .eq("id", share.id)
      .select()
      .single();
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return null;
    }
    fill(data);
    setMsg("נשמר ✓");
    return data as Row;
  }

  async function regenerate() {
    if (!(await confirmAction("ליצור קישור חדש? הקישור הקודם יפסיק לעבוד."))) return;
    await save({ token: newToken() });
  }

  async function copy() {
    await navigator.clipboard.writeText(link).catch(() => {});
    setMsg("הקישור הועתק ✓");
  }

  async function saveBrand() {
    const { error } = await supabase.from("organizations").update({ share_brand: brand }).eq("id", orgId);
    setMsg(error ? error.message : "המיתוג נשמר ✓");
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".png";
    const path = `${orgId}/brand/${crypto.randomUUID()}${ext}`;
    const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type || undefined });
    if (up.error) return setMsg(up.error.message);
    setBrand((b) => ({ ...b, logoUrl: supabase.storage.from("media").getPublicUrl(path).data.publicUrl }));
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const text = `היי, הנה העמוד של ${title.trim() || record.title}:\n${link}`;
  const expired = share?.expires_at && new Date(share.expires_at).getTime() < now;
  const dirty = share && (keys.join() !== (share.field_keys ?? []).join() || fileIds.join() !== (share.file_ids ?? []).join() || title !== (share.title ?? "") || intro !== (share.intro ?? ""));

  return (
    <Sheet title={`שיתוף עם לקוח · ${record.title}`} onClose={onClose} wide>
      {share === undefined && <p className="text-sm text-neutral-400">טוען…</p>}
      {share === null && (
        <div className="text-center py-6">
          <p className="text-sm text-neutral-500 mb-3">ייווצר עמוד ציבורי לקריאה בלבד עם הפרטים, התמונות והמסמכים שתבחרו. רק מי שיש לו את הקישור יכול לראות אותו.</p>
          <button onClick={create} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-tint text-white disabled:opacity-40">
            יצירת עמוד לשיתוף
          </button>
        </div>
      )}
      {share && (
        <div className="space-y-5">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full ${share.published && !expired ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>{expired ? "פג תוקף" : share.published ? "פעיל" : "לא מפורסם"}</span>
              <span className="text-neutral-400">{share.view_count} צפיות{share.last_viewed_at ? ` · אחרונה ${new Date(share.last_viewed_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>
            </div>
            <input readOnly value={link} dir="ltr" onFocus={(e) => e.currentTarget.select()} className={`${input} text-xs`} />
            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={copy} className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">העתקת קישור</button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">תצוגה מקדימה</a>
              <button
                onClick={async () => {
                  if (dirty) await save();
                  if (onWhatsApp) onWhatsApp(text);
                  else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
                }}
                className="px-3 py-1.5 rounded-lg bg-green-600 text-white"
              >
                שליחה בוואטסאפ
              </button>
              <button onClick={() => save({ published: !share.published })} className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">{share.published ? "ביטול פרסום" : "פרסום מחדש"}</button>
              <button onClick={regenerate} className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-red-500">קישור חדש</button>
            </div>
            <p className="text-[11px] text-neutral-400">ההודעה נפתחת מוכנה לעריכה — היא לא נשלחת עד שתאשרו.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-neutral-500">כותרת (ברירת מחדל: שם הרשומה)
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={record.title} className={input} />
            </label>
            <label className="text-xs text-neutral-500">תוקף עד (אופציונלי)
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={input} />
            </label>
            <label className="text-xs text-neutral-500 sm:col-span-2">טקסט פתיחה קצר
              <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} className={input} dir="auto" />
            </label>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-neutral-500 mb-1">אילו פרטים יוצגו</h3>
            <p className="text-[11px] text-neutral-400 mb-2">רק מה שמסומן יופיע בעמוד. סכומים כבויים כברירת מחדל.</p>
            <div className="grid sm:grid-cols-2 gap-1">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={keys.includes(f.key)} onChange={() => setKeys((k) => toggle(k, f.key))} />
                  <span>{f.label}</span>
                  <span className="text-xs text-neutral-400 truncate">{record.data[f.key] ? "" : "(ריק)"}</span>
                </label>
              ))}
              {fields.length === 0 && <p className="text-xs text-neutral-400">אין שדות שניתן לשתף.</p>}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-neutral-500 mb-1">תמונות ומסמכים</h3>
            <p className="text-[11px] text-neutral-400 mb-2">הקבצים נשמרים על הרשומה עצמה. התמונה הראשונה (לפי הסדר שנקבע בגלריה) היא תמונת השער.</p>
            {files.length === 0 && <p className="text-xs text-neutral-400">עוד לא הועלו קבצים — העלו אותם בגלריה / בקבצים של הרשומה.</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.filter(isImg).map((f) => (
                <button key={f.id} type="button" onClick={() => setFileIds((l) => toggle(l, f.id))} className={`relative aspect-square rounded-lg overflow-hidden border-2 ${fileIds.includes(f.id) ? "border-[var(--tint,#0f766e)]" : "border-transparent opacity-50"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumbs[f.id] && <img src={thumbs[f.id]} alt={f.name} className="w-full h-full object-cover" />}
                  {fileIds.includes(f.id) && <span className="absolute top-1 start-1 bg-white rounded-full text-xs px-1.5">✓</span>}
                </button>
              ))}
            </div>
            <ul className="mt-2 space-y-1">
              {files.filter((f) => !isImg(f)).map((f) => (
                <li key={f.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => setFileIds((l) => toggle(l, f.id))} />
                    📄 <span className="truncate">{f.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex items-center gap-3">
            <button onClick={() => save()} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-tint text-white disabled:opacity-40">שמירה{dirty ? " *" : ""}</button>
            {msg && <span className="text-xs text-neutral-500">{msg}</span>}
          </div>

          {isAdmin && (
            <section className="border-t border-neutral-200 dark:border-neutral-800 pt-3">
              <button onClick={() => setBrandOpen((o) => !o)} className="text-sm font-semibold text-neutral-500">מיתוג העמוד (לכל הארגון) {brandOpen ? "▴" : "▾"}</button>
              {brandOpen && (
                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <label className="text-xs text-neutral-500">לוגו
                    <input type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files?.[0])} className="block text-xs mt-1" />
                    {brand.logoUrl && <img src={brand.logoUrl} alt="" className="h-10 mt-1" />}
                  </label>
                  <label className="text-xs text-neutral-500">צבע ראשי
                    <input type="color" value={brand.accentColor ?? "#0f766e"} onChange={(e) => setBrand((b) => ({ ...b, accentColor: e.target.value }))} className="block h-9 w-16 mt-1" />
                  </label>
                  <label className="text-xs text-neutral-500">טלפון ליצירת קשר (כפתור וואטסאפ/חיוג)
                    <input value={brand.phone ?? ""} onChange={(e) => setBrand((b) => ({ ...b, phone: e.target.value }))} dir="ltr" className={input} />
                  </label>
                  <label className="text-xs text-neutral-500">שם איש קשר
                    <input value={brand.contactName ?? ""} onChange={(e) => setBrand((b) => ({ ...b, contactName: e.target.value }))} className={input} />
                  </label>
                  <button onClick={saveBrand} className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 w-fit">שמירת מיתוג</button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
      {share === null && msg && <p className="text-xs text-red-500 mt-2">{msg}</p>}
    </Sheet>
  );
}
