"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { DOCUMENT_STATUS, formatDuration } from "@/lib/documents";
import { DocumentInsights, docStatus, StatusChip } from "@/components/documents/DocumentInsights";
import { WhatsAppSheet } from "@/components/leads/WhatsAppSheet";

const PERIODS = [
  { id: "7", label: "7 ימים" },
  { id: "30", label: "30 יום" },
  { id: "90", label: "90 יום" },
  { id: "all", label: "הכל" },
];

const field = "px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";
const ago = (iso?: string) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `לפני ${m} דק'` : m < 1440 ? `לפני ${Math.round(m / 60)} ש'` : new Date(iso).toLocaleDateString("he-IL");
};

export default function DocumentsPage() {
  const { documents, contacts, documentTemplates, messageTemplates } = useStore();
  const [period, setPeriod] = useState("30");
  const [status, setStatus] = useState("");
  const [agent, setAgent] = useState("");
  const [template, setTemplate] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sending, setSending] = useState<{ contactId: string; url: string } | null>(null);
  const [now] = useState(() => Date.now());

  const contactName = (id?: string) => contacts.find((c) => c.id === id)?.name ?? "—";
  const agents = useMemo(() => [...new Set(documents.map((d) => d.cover.senderName).filter(Boolean))] as string[], [documents]);

  const inPeriod = documents.filter((d) => period === "all" || now - new Date(d.sentAt).getTime() < Number(period) * 86400000);
  const filtered = inPeriod
    .filter((d) => (!agent || d.cover.senderName === agent) && (!template || d.templateId === template) && (!status || docStatus(d) === status))
    .sort((a, b) => (b.lastViewedAt ?? b.sentAt).localeCompare(a.lastViewedAt ?? a.sentAt));

  // Reports count real documents only (not voided ones).
  const live = inPeriod.filter((d) => d.status !== "void" && (!agent || d.cover.senderName === agent) && (!template || d.templateId === template));
  const opened = live.filter((d) => d.viewCount > 0);
  const signed = live.filter((d) => d.status === "signed");
  const pct = (n: number) => (live.length ? `${Math.round((n / live.length) * 100)}%` : "—");
  const signedValue = signed.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const hoursToSign = signed.map((d) => (new Date(d.signedAt!).getTime() - new Date(d.sentAt).getTime()) / 3600000);
  const avgToSign = hoursToSign.length ? hoursToSign.reduce((a, b) => a + b, 0) / hoursToSign.length : null;
  // Opened recently but not signed: the leads to call now.
  const hot = live.filter((d) => d.status === "viewed" && d.lastViewedAt && now - new Date(d.lastViewedAt).getTime() < 3 * 86400000).length;

  const byAgent = agents.map((name) => {
    const mine = live.filter((d) => d.cover.senderName === name);
    return { name, sent: mine.length, opened: mine.filter((d) => d.viewCount > 0).length, signed: mine.filter((d) => d.status === "signed").length };
  });

  const open = documents.find((d) => d.id === openId);
  const sendContact = sending && contacts.find((c) => c.id === sending.contactId);

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">הצעות והסכמים</h1>
      <p className="text-sm text-neutral-500 mb-5">כל מסמך שנשלח לחתימה: מתי נפתח, כמה זמן נקרא, ומי חתם. שולחים מסמך חדש מכרטיס הליד.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)} className={`px-3 py-1.5 text-sm ${period === p.id ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>
              {p.label}
            </button>
          ))}
        </div>
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className={field}>
          <option value="">כל הנציגים</option>
          {agents.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={template} onChange={(e) => setTemplate(e.target.value)} className={field}>
          <option value="">כל התבניות</option>
          {documentTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
          <option value="">כל הסטטוסים</option>
          {Object.entries(DOCUMENT_STATUS).map(([id, s]) => (
            <option key={id} value={id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-6">
        <Kpi label="נשלחו" value={String(live.length)} />
        <Kpi label="נפתחו" value={`${opened.length}`} sub={pct(opened.length)} />
        <Kpi label="נחתמו" value={`${signed.length}`} sub={pct(signed.length)} />
        <Kpi label="שווי שנחתם" value={signedValue ? `₪${signedValue.toLocaleString("he-IL")}` : "—"} />
        <Kpi label="זמן ממוצע לחתימה" value={avgToSign == null ? "—" : avgToSign < 48 ? `${Math.round(avgToSign)} ש'` : `${Math.round(avgToSign / 24)} ימים`} />
        <Kpi label="פתחו ולא חתמו (3 ימים)" value={String(hot)} highlight={hot > 0} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-400">אין מסמכים בתקופה הזו.</p>
      ) : (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto mb-8">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
              <tr className="text-start">
                <th className="text-start font-medium px-3 py-2">ליד</th>
                <th className="text-start font-medium px-3 py-2">מסמך</th>
                <th className="text-start font-medium px-3 py-2">סטטוס</th>
                <th className="text-start font-medium px-3 py-2">צפיות</th>
                <th className="text-start font-medium px-3 py-2">זמן קריאה</th>
                <th className="text-start font-medium px-3 py-2">צפייה אחרונה</th>
                <th className="text-start font-medium px-3 py-2">נשלח</th>
                <th className="text-start font-medium px-3 py-2">נציג</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} onClick={() => setOpenId(d.id)} className="border-t border-neutral-100 dark:border-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer">
                  <td className="px-3 py-2 whitespace-nowrap">{contactName(d.contactId)}</td>
                  <td className="px-3 py-2 max-w-56 truncate">{d.title}</td>
                  <td className="px-3 py-2">
                    <StatusChip doc={d} />
                  </td>
                  <td className="px-3 py-2">{d.viewCount || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.viewSeconds ? formatDuration(d.viewSeconds) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-500">{ago(d.lastViewedAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-500">{new Date(d.sentAt).toLocaleDateString("he-IL")}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-500">{d.cover.senderName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {byAgent.length > 1 && (
        <>
          <h2 className="text-sm font-semibold text-neutral-500 mb-2">לפי נציג</h2>
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto max-w-xl">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="text-start font-medium px-3 py-2">נציג</th>
                  <th className="text-start font-medium px-3 py-2">נשלחו</th>
                  <th className="text-start font-medium px-3 py-2">נפתחו</th>
                  <th className="text-start font-medium px-3 py-2">נחתמו</th>
                  <th className="text-start font-medium px-3 py-2">אחוז חתימה</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((a) => (
                  <tr key={a.name} className="border-t border-neutral-100 dark:border-neutral-900">
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{a.sent}</td>
                    <td className="px-3 py-2">{a.opened}</td>
                    <td className="px-3 py-2">{a.signed}</td>
                    <td className="px-3 py-2">{a.sent ? `${Math.round((a.signed / a.sent) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <DocumentInsights
          doc={open}
          onClose={() => setOpenId(null)}
          onSend={open.contactId ? (url) => (setOpenId(null), setSending({ contactId: open.contactId!, url })) : undefined}
        />
      )}
      {sending && sendContact && (
        <WhatsAppSheet
          contact={sendContact}
          templateId={messageTemplates.find((t) => t.quickAction === "send_document")?.id}
          documentUrl={sending.url}
          onClose={() => setSending(null)}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${highlight ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800" : "border-neutral-200 dark:border-neutral-800"}`}>
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="text-xl font-semibold">
        {value}
        {sub && <span className="text-xs font-normal text-neutral-500 ms-1">{sub}</span>}
      </p>
    </div>
  );
}
