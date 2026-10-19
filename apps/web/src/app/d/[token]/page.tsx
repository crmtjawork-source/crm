"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { DocumentView, type CoverData, type SignatureData } from "@/components/documents/DocumentView";
import { SignaturePad } from "@/components/documents/SignaturePad";
import { SIGNER_FIELDS } from "@/lib/documents";
import type { DocSection } from "@/lib/types";

type Doc = {
  title: string;
  cover: CoverData;
  sections: DocSection[];
  signerFields: string[];
  status: "sent" | "viewed" | "signed" | "declined" | "expired";
  expiresAt: string | null;
  signature: SignatureData | null;
  contactPhone: string | null;
};

const PING_MS = 15_000;

function newSession(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PublicDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<Doc | null | "missing">(null);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [toc, setToc] = useState(false);
  const api = `/api/public/documents/${token}`;

  useEffect(() => {
    fetch(api)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setDoc)
      .catch(() => setDoc("missing"));
  }, [api]);

  // Reading time: which section is on screen, reported every few seconds.
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const loaded = doc && doc !== "missing";
  useEffect(() => {
    if (!loaded) return;
    const session = newSession();
    const post = (body: object, beacon = false) => {
      const payload = JSON.stringify({ ...body, session });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(api, payload);
      else fetch(api, { method: "POST", body: payload, keepalive: true }).catch(() => {});
    };
    post({ action: "open" });

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set((e.target as HTMLElement).dataset.section!, e.intersectionRatio);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sectionEls.current.forEach((el) => observer.observe(el));

    let pending = 0;
    const perSection: Record<string, number> = {};
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const secs = Math.min((now - last) / 1000, 5);
      last = now;
      if (document.visibilityState !== "visible") return;
      pending += secs;
      // The section taking most of the screen gets the time.
      let best = "";
      let ratio = 0;
      visible.forEach((r, id) => {
        if (r > ratio) [best, ratio] = [id, r];
      });
      if (best && ratio > 0) perSection[best] = (perSection[best] ?? 0) + secs;
    };
    const flush = (beacon = false) => {
      tick();
      if (pending < 1) return;
      const sections: Record<string, number> = {};
      for (const [k, v] of Object.entries(perSection)) if (v >= 1) sections[k] = Math.round(v);
      post({ action: "ping", seconds: Math.round(pending), sections }, beacon);
      pending = 0;
      for (const k of Object.keys(perSection)) delete perSection[k];
    };
    const ticker = setInterval(tick, 1000);
    const pinger = setInterval(() => flush(), PING_MS);
    const onHide = () => document.visibilityState === "hidden" && flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => flush(true));
    return () => {
      clearInterval(ticker);
      clearInterval(pinger);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [loaded, api]);

  if (doc === null) return <main className="min-h-screen bg-neutral-100" />;
  if (doc === "missing")
    return (
      <main className="min-h-screen bg-neutral-100 text-neutral-900 flex items-center justify-center p-6 text-center">
        <p className="text-neutral-500">המסמך לא נמצא, או שהקישור כבר לא בתוקף.</p>
      </main>
    );

  const accent = doc.cover.accent_color || "#1e3a8a";
  const open = doc.status === "sent" || doc.status === "viewed";
  const waLink = doc.contactPhone ? `https://wa.me/${doc.contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`היי, יש לי שאלה לגבי "${doc.title}"`)}` : null;

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-900 print:bg-white pb-28 print:pb-0 [color-scheme:light]" dir="rtl">
      <div className="max-w-4xl mx-auto sm:py-8 print:py-0">
        {doc.status === "expired" && <Banner tone="amber">תוקף המסמך פג. אפשר לפנות אלינו לקבלת מסמך מעודכן.</Banner>}
        {doc.status === "declined" && <Banner tone="neutral">המסמך סומן כלא רלוונטי. אם זו טעות — דברו איתנו.</Banner>}
        {doc.status === "signed" && <Banner tone="green">✓ המסמך נחתם. עותק חתום זמין להורדה כ-PDF.</Banner>}
        <DocumentView
          cover={doc.cover}
          sections={doc.sections}
          signature={doc.signature}
          sectionRef={(id, el) => (el ? sectionEls.current.set(id, el) : sectionEls.current.delete(id))}
        />
        {open && (
          <div className="bg-white px-6 sm:px-12 pb-12 print:hidden">
            <button onClick={() => setSigning(true)} className="w-full sm:w-auto px-8 py-3 rounded-lg text-white font-medium" style={{ backgroundColor: accent }}>
              ✍️ חתימה על המסמך
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-neutral-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="hidden sm:block min-w-0 me-auto">
            <p className="text-sm font-medium truncate">{doc.title}</p>
            {doc.expiresAt && open && <p className="text-xs text-neutral-500">בתוקף עד {new Date(doc.expiresAt).toLocaleDateString("he-IL")}</p>}
          </div>
          <button onClick={() => setToc(true)} className="px-3 py-2.5 rounded-lg border border-neutral-200 text-sm" aria-label="תוכן עניינים">
            ☰
          </button>
          <button onClick={() => window.print()} className="px-3 py-2.5 rounded-lg border border-neutral-200 text-sm">
            PDF
          </button>
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer" className="px-3 py-2.5 rounded-lg border border-neutral-200 text-sm">
              שאלה?
            </a>
          )}
          {open && (
            <button onClick={() => setSigning(true)} className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: accent }}>
              חתימה
            </button>
          )}
        </div>
      </div>

      {toc && (
        <Overlay onClose={() => setToc(false)} title="תוכן עניינים">
          <nav className="flex flex-col">
            {doc.sections.map((s) => (
              <a key={s.id} href={`#s-${s.id}`} onClick={() => setToc(false)} className="py-2 text-sm border-b border-neutral-100">
                {s.title}
              </a>
            ))}
          </nav>
        </Overlay>
      )}

      {signing && (
        <SignSheet
          doc={doc}
          accent={accent}
          api={api}
          onClose={() => setSigning(false)}
          onDecline={() => {
            setSigning(false);
            setDeclining(true);
          }}
          onSigned={() => {
            setSigning(false);
            fetch(api).then((r) => r.json()).then(setDoc);
          }}
        />
      )}
      {declining && (
        <DeclineSheet
          api={api}
          onClose={() => setDeclining(false)}
          onDone={() => {
            setDeclining(false);
            fetch(api).then((r) => r.json()).then(setDoc);
          }}
        />
      )}
    </main>
  );
}

function Banner({ tone, children }: { tone: "green" | "amber" | "neutral"; children: React.ReactNode }) {
  const cls = { green: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800", neutral: "bg-neutral-200 text-neutral-700" }[tone];
  return <div className={`${cls} text-sm px-6 py-3 print:hidden`}>{children}</div>;
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center print:hidden" onClick={onClose}>
      <div className="bg-white text-neutral-900 w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none" aria-label="סגירה">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const field = "w-full px-3 py-2.5 rounded-lg border border-neutral-300 text-[16px] bg-white";

function SignSheet({ doc, accent, api, onClose, onSigned, onDecline }: { doc: Doc; accent: string; api: string; onClose: () => void; onSigned: () => void; onDecline: () => void }) {
  const [name, setName] = useState(doc.cover.prepared_for ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [image, setImage] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!image) return setError("יש לחתום בתיבת החתימה");
    setBusy(true);
    const res = await fetch(api, { method: "POST", body: JSON.stringify({ action: "sign", name, fields, image, agreed }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "החתימה נכשלה — נסו שוב");
      setBusy(false);
      return;
    }
    onSigned();
  }

  return (
    <Overlay title="חתימה על המסמך" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="block text-neutral-600 mb-1">שם מלא</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={field} autoComplete="name" />
        </label>
        {doc.signerFields.map((id) => {
          const f = SIGNER_FIELDS.find((x) => x.id === id);
          return (
            <label key={id} className="block text-sm">
              <span className="block text-neutral-600 mb-1">{f?.label ?? id}</span>
              <input type={f?.type ?? "text"} value={fields[id] ?? ""} onChange={(e) => setFields((s) => ({ ...s, [id]: e.target.value }))} required className={field} dir="auto" />
            </label>
          );
        })}
        <div className="text-sm">
          <span className="block text-neutral-600 mb-1">חתימה</span>
          <SignaturePad onChange={setImage} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" required />
          <span>קראתי את המסמך במלואו ואני מאשר/ת את תנאיו. החתימה האלקטרונית שלי מחייבת כמו חתימה בכתב יד.</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full py-3 rounded-lg text-white font-medium disabled:opacity-50" style={{ backgroundColor: accent }}>
          {busy ? "חותם…" : "אישור וחתימה"}
        </button>
        <button type="button" onClick={onDecline} className="w-full text-xs text-neutral-500 hover:underline">
          זה לא מתאים לי כרגע
        </button>
      </form>
    </Overlay>
  );
}

function DeclineSheet({ api, onClose, onDone }: { api: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    await fetch(api, { method: "POST", body: JSON.stringify({ action: "decline", reason }) });
    onDone();
  }
  return (
    <Overlay title="לא מתאים כרגע?" onClose={onClose}>
      <p className="text-sm text-neutral-600 mb-3">נשמח לדעת למה — זה יעזור לנו לחזור אליך עם משהו שמתאים יותר.</p>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={field} placeholder="(לא חובה)" />
      <button onClick={submit} disabled={busy} className="w-full mt-3 py-2.5 rounded-lg border border-neutral-300 text-sm disabled:opacity-50">
        שליחה
      </button>
    </Overlay>
  );
}
