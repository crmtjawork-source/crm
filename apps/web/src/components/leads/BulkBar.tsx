"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Sheet } from "@/components/ui/Sheet";
import { canAssignLeads, canEditCampaign, effectiveRole } from "@/lib/permissions";
import type { Contact } from "@/lib/types";

type Action = "owner" | "status" | "stage" | "campaign" | "tag" | "field" | "delete";

// Runs `fn` over the items a few at a time, so a bulk change of hundreds of
// leads doesn't fire hundreds of requests at once.
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>, onProgress: (done: number) => void) {
  let next = 0;
  let done = 0;
  let failed = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch {
        failed++;
      }
      onProgress(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return failed;
}

const field = "w-full px-2 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

// The bar that appears when leads are ticked: change many leads at once
// (owner, status, stage, campaign, a tag, any field) or delete them.
export function BulkBar({ contacts, onClear }: { contacts: Contact[]; onClear: () => void }) {
  const { members, currentMemberId, roles, leadStatuses, pipelines, campaigns, leadFields, opportunities, updateContact, setHandlingStatus, moveOpportunity, addOpportunity, setOpportunityStatus, addTag, updateContactFields, deleteContact } =
    useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const role = effectiveRole(me, roles);
  const canAssign = canAssignLeads(me, role);
  const canCampaign = canEditCampaign(me, role);
  const canDelete = me?.role !== "agent";

  const [action, setAction] = useState<Action | null>(null);
  const [value, setValue] = useState("");
  const [fieldKey, setFieldKey] = useState(leadFields[0]?.key ?? "");
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string>("");

  const n = contacts.length;
  const chosenField = leadFields.find((f) => f.key === fieldKey);

  function close() {
    if (progress && progress.done < progress.total) return; // still running
    setAction(null);
    setValue("");
    setConfirmText("");
    setProgress(null);
    setResult("");
  }

  async function apply() {
    if (!action) return;
    const total = contacts.length;
    setProgress({ done: 0, total });
    setResult("");
    let failed = 0;
    const run = (fn: (c: Contact) => Promise<void>) => pool(contacts, 4, fn, (done) => setProgress({ done, total }));

    if (action === "owner") failed = await run((c) => updateContact(c.id, { ownerEmail: value || undefined }));
    else if (action === "status") failed = await run((c) => setHandlingStatus(c.id, value || null));
    else if (action === "campaign") failed = await run((c) => updateContact(c.id, { campaignId: value || undefined }));
    else if (action === "tag") failed = await run((c) => addTag(c.id, value.trim()));
    else if (action === "field") failed = await run((c) => updateContactFields(c.id, { [fieldKey]: value }));
    else if (action === "delete") failed = await run((c) => deleteContact(c.id));
    else if (action === "stage") {
      const [pipelineId, stageId] = value.split("|");
      failed = await run(async (c) => {
        const deals = opportunities.filter((o) => o.contactId === c.id && o.pipelineId === pipelineId);
        const deal = deals.find((o) => o.status === "open") ?? deals[0];
        if (deal) {
          if (deal.status !== "open") await setOpportunityStatus(deal.id, "open");
          await moveOpportunity(deal.id, stageId);
        } else await addOpportunity({ contactId: c.id, pipelineId, stageId, title: c.name, value: 0 });
      });
    }
    setProgress({ done: total, total });
    setResult(failed ? `הושלם: ${total - failed} עודכנו, ${failed} נכשלו (למשל חוסר הרשאה).` : `הושלם: ${total} לידים עודכנו.`);
    if (action === "delete") onClear();
  }

  const ready =
    action === "owner" || action === "status" || action === "campaign"
      ? true
      : action === "stage"
        ? value.includes("|")
        : action === "tag"
          ? value.trim().length > 0
          : action === "field"
            ? Boolean(fieldKey) && value.trim().length > 0
            : action === "delete"
              ? confirmText.trim() === "מחיקה"
              : false;

  const btn = "px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap";
  const running = progress !== null && progress.done < progress.total;
  const finished = progress !== null && progress.done >= progress.total;

  return (
    <>
      <div className="fixed bottom-16 md:bottom-4 inset-x-0 z-40 flex justify-center px-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto max-w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl px-3 py-2">
          <span className="text-sm font-medium shrink-0">{n} נבחרו</span>
          {canAssign && (
            <button onClick={() => setAction("owner")} className={btn}>
              שיוך לנציג
            </button>
          )}
          {leadStatuses.length > 0 && (
            <button onClick={() => setAction("status")} className={btn}>
              סטטוס
            </button>
          )}
          {pipelines.length > 0 && (
            <button onClick={() => setAction("stage")} className={btn}>
              שלב
            </button>
          )}
          {canCampaign && (
            <button onClick={() => setAction("campaign")} className={btn}>
              קמפיין
            </button>
          )}
          <button onClick={() => setAction("tag")} className={btn}>
            תגית
          </button>
          {leadFields.length > 0 && (
            <button onClick={() => setAction("field")} className={btn}>
              שינוי שדה
            </button>
          )}
          {canDelete && (
            <button onClick={() => setAction("delete")} className={`${btn} text-red-600 border-red-200 dark:border-red-900`}>
              מחיקה
            </button>
          )}
          <button onClick={onClear} className="text-xs text-neutral-400 hover:underline shrink-0 ps-1">
            ביטול בחירה
          </button>
        </div>
      </div>

      {action && (
        <Sheet
          title={
            {
              owner: "שיוך לנציג",
              status: "שינוי סטטוס ליד",
              stage: "העברה לשלב",
              campaign: "שינוי קמפיין",
              tag: "הוספת תגית",
              field: "שינוי שדה",
              delete: "מחיקת לידים",
            }[action] + ` — ${n} לידים`
          }
          onClose={close}
        >
          <div className="space-y-3">
            {action === "owner" && (
              <select value={value} onChange={(e) => setValue(e.target.value)} className={field} disabled={progress !== null}>
                <option value="">ללא בעלים</option>
                {members
                  .filter((m) => m.status === "active")
                  .map((m) => (
                    <option key={m.id} value={m.email.toLowerCase()}>
                      {m.name}
                    </option>
                  ))}
              </select>
            )}
            {action === "status" && (
              <select value={value} onChange={(e) => setValue(e.target.value)} className={field} disabled={progress !== null}>
                <option value="">ללא סטטוס</option>
                {leadStatuses.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            )}
            {action === "stage" && (
              <>
                <select value={value} onChange={(e) => setValue(e.target.value)} className={field} disabled={progress !== null}>
                  <option value="">בחירת שלב…</option>
                  {pipelines.map((p) => (
                    <optgroup key={p.id} label={pipelines.length > 1 ? p.name : ""}>
                      {p.stages.map((st) => (
                        <option key={st.id} value={`${p.id}|${st.id}`}>
                          {st.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="text-xs text-neutral-500">ליד שיש לו עסקה בפייפליין הזה — העסקה עוברת לשלב. ליד בלי עסקה נכנס לפייפליין בשלב הזה.</p>
              </>
            )}
            {action === "campaign" && (
              <select value={value} onChange={(e) => setValue(e.target.value)} className={field} disabled={progress !== null}>
                <option value="">ללא קמפיין</option>
                {campaigns
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
            {action === "tag" && <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="שם התגית" className={field} disabled={progress !== null} />}
            {action === "field" && (
              <>
                <select
                  value={fieldKey}
                  onChange={(e) => {
                    setFieldKey(e.target.value);
                    setValue("");
                  }}
                  className={field}
                  disabled={progress !== null}
                >
                  {leadFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                {chosenField && (chosenField.type === "select" || chosenField.type === "multi_select") ? (
                  <select value={value} onChange={(e) => setValue(e.target.value)} className={field} disabled={progress !== null}>
                    <option value="">בחירת ערך…</option>
                    {chosenField.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    type={chosenField?.type === "number" || chosenField?.type === "currency" ? "number" : chosenField?.type === "date" ? "date" : "text"}
                    placeholder="ערך חדש"
                    className={field}
                    disabled={progress !== null}
                  />
                )}
                <p className="text-xs text-neutral-500">הערך יחליף את הערך הקיים בשדה אצל כל הלידים שנבחרו.</p>
              </>
            )}
            {action === "delete" && (
              <>
                <p className="text-sm text-red-600 leading-relaxed">
                  {n} לידים יימחקו לצמיתות, יחד עם העסקאות, ההודעות וההיסטוריה שלהם. אי אפשר לשחזר. להקלדה: <strong>מחיקה</strong>
                </p>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="מחיקה" className={field} disabled={progress !== null} />
              </>
            )}

            {progress && (
              <div>
                <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {progress.done} מתוך {progress.total}
                </p>
              </div>
            )}
            {result && <p className="text-sm text-emerald-600">{result}</p>}

            <div className="flex gap-2 pt-1">
              {!finished && (
                <button
                  onClick={apply}
                  disabled={!ready || running}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 ${action === "delete" ? "bg-red-600 text-white" : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"}`}
                >
                  {running ? "מעדכן…" : action === "delete" ? `מחיקת ${n} לידים` : `החלה על ${n} לידים`}
                </button>
              )}
              <button onClick={close} disabled={running} className={`${finished ? "flex-1 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm" : "px-4 text-sm text-neutral-500"}`}>
                {finished ? "סגירה" : "ביטול"}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
