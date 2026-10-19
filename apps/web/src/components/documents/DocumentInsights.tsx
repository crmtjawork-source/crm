"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { DOCUMENT_STATUS, documentUrl, formatDuration } from "@/lib/documents";
import type { CrmDocument, DocumentView as DocView } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { SectionsEditor } from "./SectionsEditor";

const subscribe = () => () => {};
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");

export function docStatus(doc: CrmDocument): keyof typeof DOCUMENT_STATUS {
  if ((doc.status === "sent" || doc.status === "viewed") && doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) return "expired";
  return doc.status;
}

export function StatusChip({ doc }: { doc: CrmDocument }) {
  const s = DOCUMENT_STATUS[docStatus(doc)];
  return <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${s.tone}`}>{s.label}</span>;
}

// Everything about one sent document: opens, reading time per section,
// reading sessions, the signature — plus copy link / edit / void.
export function DocumentInsights({ doc, onClose, onSend }: { doc: CrmDocument; onClose: () => void; onSend?: (url: string) => void }) {
  const { contacts, members, loadDocumentViews, updateDocument } = useStore();
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const url = documentUrl(origin, doc.token);
  const [views, setViews] = useState<DocView[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<CrmDocument["sections"] | null>(null);
  const contact = contacts.find((c) => c.id === doc.contactId);
  const sender = members.find((m) => m.id.startsWith("mem:") && m.email && m.email === doc.cover.senderEmail)?.name ?? doc.cover.senderName;

  useEffect(() => {
    loadDocumentViews(doc.id).then(setViews);
  }, [doc.id, doc.viewCount, doc.viewSeconds, loadDocumentViews]);

  const perSection: Record<string, number> = {};
  for (const v of views ?? []) for (const [k, s] of Object.entries(v.sections)) perSection[k] = (perSection[k] ?? 0) + s;
  const maxSection = Math.max(1, ...Object.values(perSection));

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const status = docStatus(doc);
  const editable = status === "sent" || status === "viewed";

  return (
    <Sheet title={doc.title} onClose={onClose} wide>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip doc={doc} />
          {contact && (
            <Link href={`/contacts/${contact.id}`} className="hover:underline">
              {contact.name}
            </Link>
          )}
          {doc.value != null && <span className="text-neutral-500">· ₪{doc.value.toLocaleString("he-IL")}</span>}
          {sender && <span className="text-neutral-400 text-xs ms-auto">נשלח ע״י {sender}</span>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="נשלח" value={when(doc.sentAt)} />
          <Stat label="צפיות" value={String(doc.viewCount)} />
          <Stat label="זמן קריאה" value={doc.viewSeconds ? formatDuration(doc.viewSeconds) : "—"} />
          <Stat label={doc.signedAt ? "נחתם" : "צפייה אחרונה"} value={when(doc.signedAt ?? doc.lastViewedAt)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={copy} className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800">
            {copied ? "הועתק ✓" : "העתקת קישור"}
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800">
            פתיחה
          </a>
          {onSend && editable && (
            <button onClick={() => onSend(url)} className="px-3 py-1.5 rounded-md bg-emerald-600 text-white">
              שליחה בוואטסאפ
            </button>
          )}
          {editable && (
            <button onClick={() => setEditing(doc.sections)} className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800">
              עריכת התוכן
            </button>
          )}
          {doc.status !== "signed" && doc.status !== "void" && (
            <button
              onClick={() => confirm("לבטל את המסמך? הקישור יפסיק לעבוד.") && updateDocument(doc.id, { status: "void" })}
              className="px-3 py-1.5 text-neutral-400 hover:text-red-500 ms-auto"
            >
              ביטול המסמך
            </button>
          )}
        </div>

        {editing && (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-3">
            <p className="text-xs text-amber-600">השינויים יופיעו מיד למי שפותח את הקישור.</p>
            <SectionsEditor sections={editing} onChange={setEditing} />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await updateDocument(doc.id, { sections: editing });
                  setEditing(null);
                }}
                className="px-4 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              >
                שמירה
              </button>
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-neutral-500">
                ביטול
              </button>
            </div>
          </div>
        )}

        {doc.signature && (
          <div className="border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-lg p-3 space-y-1">
            <p className="font-medium">✍️ נחתם ע״י {doc.signature.name}</p>
            {doc.signature.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.signature.image} alt="חתימה" className="h-16 bg-white rounded" />
            )}
            <p className="text-xs text-neutral-500">
              {when(doc.signedAt)} · IP {doc.signature.ip || "—"}
            </p>
            {Object.entries(doc.signature.fields ?? {}).map(([k, v]) => (
              <p key={k} className="text-xs text-neutral-600 dark:text-neutral-300">
                {k}: {v}
              </p>
            ))}
          </div>
        )}
        {doc.status === "declined" && (
          <p className="text-red-600">
            ✖️ נדחה {when(doc.declinedAt)}
            {doc.declineReason && ` — "${doc.declineReason}"`}
          </p>
        )}

        <div>
          <h3 className="font-semibold mb-2">כמה זמן נקרא כל פרק</h3>
          {!views ? (
            <p className="text-neutral-400 text-xs">טוען…</p>
          ) : !Object.keys(perSection).length ? (
            <p className="text-neutral-400 text-xs">עוד לא נקרא.</p>
          ) : (
            <ul className="space-y-1.5">
              {doc.sections.map((s) => {
                const secs = perSection[s.id] ?? 0;
                return (
                  <li key={s.id} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-2 text-xs">
                    <span className="truncate">{s.title}</span>
                    <span className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <span className="block h-full bg-sky-500 rounded-full" style={{ width: `${(secs / maxSection) * 100}%` }} />
                    </span>
                    <span className="text-neutral-500 text-end">{secs ? formatDuration(secs) : "—"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {views && views.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">כניסות</h3>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-900 text-xs">
              {views.map((v) => (
                <li key={v.id} className="py-1.5 flex justify-between gap-2">
                  <span>{when(v.startedAt)}</span>
                  <span className="text-neutral-500">{v.device}</span>
                  <span className="text-neutral-500">{formatDuration(v.seconds)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}
