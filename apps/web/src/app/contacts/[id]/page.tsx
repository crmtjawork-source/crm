"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { BackLink } from "@/components/BackLink";
import { useLeadChatHref } from "@/lib/useMyGateway";
import { ATTRIBUTION_LABELS, platformLabel } from "@/lib/attribution";
import { QuickActions } from "@/components/leads/QuickActions";
import { LeadDocuments } from "@/components/documents/LeadDocuments";
import { LeadCalls } from "@/components/leads/LeadCalls";
import { ColorChip, colorAt } from "@/components/ui/ColorChip";
import { LeadFieldsCard } from "@/components/leads/LeadFieldsCard";
import { LeadRecords } from "@/components/leads/LeadRecords";
import { FilesSection } from "@/components/FilesSection";
import { TaskRow } from "@/components/leads/TaskRow";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    getContact,
    opportunities,
    activitiesFor,
    updateContact,
    deleteContact,
    addTag,
    removeTag,
    addNote,
    members,
    currentMemberId,
    pipelines,
    loadActivitiesFor,
    setOpportunityStatus,
    campaigns,
    tasks,
    appointments,
    scheduledMessages,
    cancelScheduledMessage,
    leadStatuses,
    setHandlingStatus,
  } = useStore();
  const contact = getContact(id);
  const chatHref = useLeadChatHref(id);

  useEffect(() => {
    loadActivitiesFor(id);
  }, [id, loadActivitiesFor]);
  const canDelete = members.find((m) => m.id === currentMemberId)?.role !== "agent";

  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");

  const [newTag, setNewTag] = useState("");
  const [noteText, setNoteText] = useState("");

  if (!contact) {
    return (
      <div className="p-6 text-neutral-500">
        <BackLink fallback="/contacts" />
        <p>הליד לא נמצא.</p>
      </div>
    );
  }

  const contactOpportunities = opportunities.filter((o) => o.contactId === contact.id);
  const activities = activitiesFor(contact.id);

  function startEdit() {
    if (!contact) return;
    setName(contact.name);
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
    setEditingInfo(true);
  }

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!contact || !name.trim()) return;
    await updateContact(contact.id, {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });
    setEditingInfo(false);
  }

  async function handleDeleteContact() {
    if (!contact) return;
    if (!confirm(`למחוק את ${contact.name}? הפעולה מוחקת גם את ההזדמנויות והפעילות שלו.`)) return;
    await deleteContact(contact.id);
    router.push("/contacts");
  }

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTag.trim() || !contact) return;
    await addTag(contact.id, newTag.trim());
    setNewTag("");
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim() || !contact) return;
    await addNote(contact.id, noteText.trim());
    setNoteText("");
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <BackLink fallback="/contacts" />
      <div className="flex items-start justify-between mb-1">
        {editingInfo ? (
          <form onSubmit={saveInfo} className="w-full space-y-2 mb-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent font-bold"
              placeholder="שם"
            />
            <div className="flex gap-2">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                placeholder="טלפון"
                className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                placeholder="אימייל"
                className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                שמירה
              </button>
              <button type="button" onClick={() => setEditingInfo(false)} className="px-3 py-1.5 text-sm text-neutral-400">
                ביטול
              </button>
            </div>
          </form>
        ) : (
          <div className="mb-4">
            <h1 className="text-xl font-bold mb-1">{contact.name}</h1>
            <p className="text-sm text-neutral-500">
              <span dir="ltr">{contact.phone ?? "אין טלפון"}</span> · {contact.email ?? "אין אימייל"}
            </p>
            <p className="text-xs text-neutral-400 mt-0.5">
              נכנס ב־{new Date(contact.createdAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        )}
      </div>

      {!editingInfo && (
        <div className="flex gap-3 mb-4 text-xs">
          {contact.phone && (
            <Link href={chatHref} className="text-emerald-600 hover:underline">
              שיחה בוואטסאפ
            </Link>
          )}
          <button onClick={startEdit} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline">
            עריכת פרטים
          </button>
          {canDelete ? (
            <button onClick={handleDeleteContact} className="text-neutral-400 hover:text-red-500 hover:underline">
              מחיקת ליד
            </button>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700" title="רק מנהלים ובעלים יכולים למחוק לידים">
              מחיקת ליד
            </span>
          )}
        </div>
      )}

      {!editingInfo && <QuickActions contact={contact} />}

      {(() => {
        const leadTasks = tasks.filter((t) => t.contactId === contact.id && !t.done);
        const queued = scheduledMessages
          .filter((m) => m.contactId === contact.id && (m.status === "pending" || m.status === "failed"))
          .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
        const upcoming = appointments
          .filter((a) => a.contactId === contact.id && a.startAt >= new Date().toISOString())
          .sort((a, b) => a.startAt.localeCompare(b.startAt));
        if (!leadTasks.length && !upcoming.length && !queued.length) return null;
        return (
          <section className="mb-5 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2">
            {upcoming.map((a) => (
              <p key={a.id} className="text-sm py-1">
                📅 {a.title} ·{" "}
                {new Date(a.startAt).toLocaleString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            ))}
            {queued.map((m) => (
              <p key={m.id} className="text-sm py-1 flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  ⏰ {m.label} ·{" "}
                  {new Date(m.sendAt).toLocaleString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {m.status === "failed" && <span className="text-red-500"> · נכשל: {m.error}</span>}
                </span>
                {m.status === "pending" && (
                  <button onClick={() => cancelScheduledMessage(m.id)} className="text-xs text-neutral-400 hover:text-red-500 shrink-0">
                    ביטול
                  </button>
                )}
              </p>
            ))}
            {leadTasks.length > 0 && (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {leadTasks.map((t) => (
                  <TaskRow key={t.id} task={t} showContact={false} />
                ))}
              </ul>
            )}
          </section>
        );
      })()}

      {leadStatuses.length > 0 && (
        <label className="flex items-center gap-2 mb-2 text-sm">
          <span className="text-neutral-500">סטטוס ליד:</span>
          <select
            value={contact.handlingStatus ?? ""}
            onChange={(e) => setHandlingStatus(contact.id, e.target.value || null)}
            className="px-2 py-1 rounded-md border bg-transparent font-medium"
            style={(() => {
              const i = leadStatuses.findIndex((st) => st.name === contact.handlingStatus);
              const c = i >= 0 ? colorAt(leadStatuses[i].color, i) : undefined;
              return c ? { color: c, borderColor: c, backgroundColor: `${c}14` } : undefined;
            })()}
          >
            <option value="">—</option>
            {leadStatuses.map((st) => (
              <option key={st.id} value={st.name}>
                {st.name}
              </option>
            ))}
            {contact.handlingStatus && !leadStatuses.some((st) => st.name === contact.handlingStatus) && <option value={contact.handlingStatus}>{contact.handlingStatus}</option>}
          </select>
        </label>
      )}

      <label className="flex items-center gap-2 mb-4 text-sm">
        <span className="text-neutral-500">בעלים:</span>
        <select
          value={contact.ownerEmail?.toLowerCase() ?? ""}
          onChange={(e) => updateContact(contact.id, { ownerEmail: e.target.value || undefined })}
          className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        >
          <option value="">ללא בעלים</option>
          {members.map((m) => (
            <option key={m.id} value={m.email.toLowerCase()}>
              {m.name}
              {m.status === "invited" ? " (הוזמן)" : ""}
            </option>
          ))}
          {contact.ownerEmail && !members.some((m) => m.email.toLowerCase() === contact.ownerEmail!.toLowerCase()) && (
            <option value={contact.ownerEmail.toLowerCase()}>{contact.ownerEmail}</option>
          )}
        </select>
      </label>

      <label className="flex items-center gap-2 mb-2 text-sm">
        <span className="text-neutral-500">קמפיין:</span>
        <select
          value={contact.campaignId ?? ""}
          onChange={(e) => updateContact(contact.id, { campaignId: e.target.value || undefined })}
          className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent max-w-80"
        >
          <option value="">ללא קמפיין</option>
          {campaigns
            .filter((c) => !c.archived || c.id === contact.campaignId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({platformLabel(c.platform)}
                {c.agency ? ` · ${c.agency}` : ""})
              </option>
            ))}
        </select>
      </label>
      {Object.keys(contact.attribution).length > 0 && (
        <details className="mb-4 text-xs text-neutral-500">
          <summary className="cursor-pointer">נתוני מעקב (UTM / מודעה)</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {Object.entries(contact.attribution).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-neutral-400">{ATTRIBUTION_LABELS[k] ?? k}</dt>
                <dd className="break-all" dir="auto">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {contact.tags.map((t) => (
          <span
            key={t}
            className="text-xs px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center gap-1"
          >
            {t}
            <button onClick={() => removeTag(contact.id, t)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
              ×
            </button>
          </span>
        ))}
        <form onSubmit={handleAddTag} className="inline-flex">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="+ תגית"
            className="w-20 px-2 py-1 text-xs rounded-full border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
        </form>
      </div>

      <LeadFieldsCard contact={contact} />
      <LeadRecords contact={contact} />

      <LeadDocuments contact={contact} />
      <LeadCalls contactId={contact.id} />
      <FilesSection contactId={contact.id} />

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">הזדמנויות</h2>
        {contactOpportunities.length === 0 ? (
          <p className="text-sm text-neutral-400">אין הזדמנויות.</p>
        ) : (
          <ul className="space-y-2">
            {contactOpportunities.map((o) => {
              const pipeline = pipelines.find((p) => p.id === o.pipelineId);
              const stage = pipeline?.stages.find((s) => s.id === o.stageId);
              const outcome = { won: "נסגרה ✓", lost: "לא נסגרה", abandoned: "בוטלה" } as const;
              return (
                <li key={o.id} className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 text-sm flex items-center justify-between gap-2">
                  <div>
                    <p>
                      {o.title} {o.value > 0 ? `· ₪${o.value.toLocaleString("he-IL")}` : ""}
                    </p>
                    <p className="text-xs text-neutral-500 flex items-center gap-1 flex-wrap">
                      {pipeline?.name} ·{" "}
                      <ColorChip label={stage?.name ?? ""} color={pipeline && stage ? colorAt(stage.color, pipeline.stages.indexOf(stage)) : undefined} />
                      {o.status !== "open" && (
                        <span className={o.status === "won" ? "text-emerald-600" : "text-neutral-500"}>
                          {" "}· {outcome[o.status]}
                          {o.lostReason ? ` (${o.lostReason})` : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  {o.status !== "open" && (
                    <button onClick={() => setOpportunityStatus(o.id, "open")} className="text-xs text-neutral-400 hover:underline shrink-0">
                      פתיחה מחדש
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">ציר זמן</h2>
        <form onSubmit={handleAddNote} className="flex gap-2 mb-4">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="הוספת הערה…"
            className="flex-1 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
        {activities.length === 0 ? (
          <p className="text-sm text-neutral-400">אין עדיין פעילות.</p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="text-sm flex gap-2">
                <span className={a.type === "note" ? "text-neutral-400" : "text-neutral-300"}>
                  {a.type === "note" ? "📝" : "→"}
                </span>
                <div className="min-w-0">
                  <p className="whitespace-pre-line break-words">{a.text}</p>
                  <p className="text-xs text-neutral-400">
                    {new Date(a.createdAt).toLocaleString("he-IL")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
