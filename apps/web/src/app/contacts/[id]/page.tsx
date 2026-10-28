"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { canAssignLeads, canEditCampaign, effectiveRole } from "@/lib/permissions";
import { BackLink } from "@/components/BackLink";
import { useLeadChatHref } from "@/lib/useMyGateway";
import { ATTRIBUTION_LABELS, platformLabel } from "@/lib/attribution";
import { QuickActions } from "@/components/leads/QuickActions";
import { StageSelect } from "@/components/leads/StageSelect";
import { useStageMovePrompt } from "@/components/leads/StageMovePrompt";
import { LeadUpcoming } from "@/components/leads/LeadUpcoming";
import { LeadStepper } from "@/components/leads/LeadStepper";
import { LeadTimeline } from "@/components/leads/LeadTimeline";
import { LeadNotesPanel } from "@/components/leads/LeadNotesPanel";
import { LeadDocuments } from "@/components/documents/LeadDocuments";
import { LeadCalls } from "@/components/leads/LeadCalls";
import { colorAt } from "@/components/ui/ColorChip";
import { LeadFieldsCard } from "@/components/leads/LeadFieldsCard";
import { LeadRecords } from "@/components/leads/LeadRecords";
import { FilesSection } from "@/components/FilesSection";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    getContact,
    opportunities,
    pipelines,
    lostReasons,
    updateOpportunity,
    updateContact,
    deleteContact,
    addTag,
    removeTag,
    members,
    currentMemberId,
    roles,
    loadActivitiesFor,
    campaigns,
    leadStatuses,
    setHandlingStatus,
  } = useStore();
  const contact = getContact(id);
  const chatHref = useLeadChatHref(id);
  const stagePrompt = useStageMovePrompt();

  useEffect(() => {
    loadActivitiesFor(id);
  }, [id, loadActivitiesFor]);
  const canDelete = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const me = members.find((m) => m.id === currentMemberId);
  const canAssign = canAssignLeads(me, effectiveRole(me, roles));
  const canCampaign = canEditCampaign(me, effectiveRole(me, roles));

  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");

  const [newTag, setNewTag] = useState("");

  if (!contact) {
    return (
      <div className="p-6 text-neutral-500">
        <BackLink fallback="/contacts" />
        <p>הליד לא נמצא.</p>
      </div>
    );
  }


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

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-start gap-3 flex-wrap">
        <BackLink fallback="/contacts" />
        <LeadStepper contactId={contact.id} />
      </div>
      {/* Wide screens: the lead's details on the start side, notes and history beside them. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,42rem)_minmax(20rem,1fr)] lg:gap-8 lg:items-start">
      <div className="min-w-0">
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

      <LeadUpcoming contact={contact} />

      {(() => {
        // The lead's current deal: the open one if any, else the latest.
        const deals = opportunities.filter((o) => o.contactId === contact.id);
        const deal = deals.find((o) => o.status === "open") ?? [...deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        const stage = deal && pipelines.find((p) => p.id === deal.pipelineId)?.stages.find((st) => st.id === deal.stageId);
        // In a "not closed" stage the reason is shown right under the stage, and can be changed.
        const showReason = deal && (stage?.asksLostReason || deal.lostReason);
        return (
          <>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span className="text-neutral-500">שלב:</span>
              <StageSelect contact={contact} deal={deal} afterMove={stagePrompt.afterMove} />
            </div>
            {showReason && deal && (
              <label className="flex items-center gap-2 mb-2 text-sm">
                <span className="text-neutral-500">סיבת אי-סגירה:</span>
                <select
                  value={deal.lostReason ?? ""}
                  onChange={(e) => updateOpportunity(deal.id, { lostReason: e.target.value || undefined })}
                  className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent font-medium max-w-72"
                >
                  <option value="">לא נבחרה סיבה</option>
                  {lostReasons.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {deal.lostReason && !lostReasons.includes(deal.lostReason) && <option value={deal.lostReason}>{deal.lostReason}</option>}
                </select>
              </label>
            )}
          </>
        );
      })()}
      {stagePrompt.element}

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
          disabled={!canAssign}
          title={canAssign ? undefined : "אין לך הרשאה לשייך לידים"}
          onChange={(e) => updateContact(contact.id, { ownerEmail: e.target.value || undefined })}
          className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent disabled:opacity-60 disabled:cursor-not-allowed"
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
          disabled={!canCampaign}
          title={canCampaign ? undefined : "אין לך הרשאה לשנות קמפיין"}
          onChange={(e) => updateContact(contact.id, { campaignId: e.target.value || undefined })}
          className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent max-w-80 disabled:opacity-60 disabled:cursor-not-allowed"
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

      {/* Phones and narrow windows keep the compact timeline under the details. */}
      <div className="lg:hidden">
        <LeadTimeline contact={contact} />
      </div>
      </div>
      <div className="hidden lg:block">
        <LeadNotesPanel contact={contact} />
      </div>
      </div>
    </div>
  );
}
