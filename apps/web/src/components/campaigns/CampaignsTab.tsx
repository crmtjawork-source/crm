"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PLATFORMS, platformLabel } from "@/lib/attribution";
import type { Campaign } from "@/lib/types";

const input = "px-2 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

export function CampaignsTab({ isAdmin }: { isAdmin: boolean }) {
  const { campaigns, contacts, addCampaign } = useStore();
  const [showArchived, setShowArchived] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("other");
  const [agency, setAgency] = useState("");

  const leadCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) if (c.campaignId) m.set(c.campaignId, (m.get(c.campaignId) ?? 0) + 1);
    return m;
  }, [contacts]);
  const agencies = [...new Set(campaigns.map((c) => c.agency).filter(Boolean) as string[])].sort();

  const list = campaigns
    .filter((c) => showArchived || !c.archived)
    .filter((c) => !platformFilter || c.platform === platformFilter)
    .sort((a, b) => (leadCounts.get(b.id) ?? 0) - (leadCounts.get(a.id) ?? 0));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addCampaign({ name: name.trim(), platform, agency: agency.trim() || undefined });
    setName("");
    setAgency("");
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
        קמפיינים נוצרים אוטומטית מלידים שנכנסים (טופסי פייסבוק, כתובות קליטה, UTM). כאן מסדרים אותם: שם, פלטפורמה, איזו סוכנות מנהלת
        כל קמפיין, ואיחוד כפילויות. אפשר גם להוסיף ידנית ערוצים כמו שלט, רדיו או כנס.
      </p>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 mb-6 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
        <label className="text-xs">
          <span className="block text-neutral-500 mb-1">שם הקמפיין</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={input} />
        </label>
        <label className="text-xs">
          <span className="block text-neutral-500 mb-1">פלטפורמה</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-neutral-500 mb-1">סוכנות (לא חובה)</span>
          <input value={agency} onChange={(e) => setAgency(e.target.value)} list="agencies" className={input} />
        </label>
        <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          + הוספה
        </button>
      </form>
      <datalist id="agencies">
        {agencies.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <div className="flex items-center gap-3 mb-3 text-xs">
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className={input}>
          <option value="">כל הפלטפורמות</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          הצגת קמפיינים בארכיון
        </label>
        <span className="text-neutral-400 ms-auto">{list.length} קמפיינים</span>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-neutral-400">אין קמפיינים עדיין.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <CampaignRow key={c.id} campaign={c} leads={leadCounts.get(c.id) ?? 0} others={campaigns} isAdmin={isAdmin} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CampaignRow({ campaign, leads, others, isAdmin }: { campaign: Campaign; leads: number; others: Campaign[]; isAdmin: boolean }) {
  const { updateCampaign, deleteCampaign, mergeCampaigns } = useStore();
  const [name, setName] = useState(campaign.name);
  const [agency, setAgency] = useState(campaign.agency ?? "");
  const [merging, setMerging] = useState(false);
  const [target, setTarget] = useState("");

  async function handleMerge() {
    const into = others.find((o) => o.id === target);
    if (!into) return;
    if (!confirm(`לאחד את "${campaign.name}" לתוך "${into.name}"? ${leads} לידים וההוצאות יעברו אליו.`)) return;
    await mergeCampaigns(campaign.id, into.id);
  }

  async function handleDelete() {
    if (!confirm(`למחוק את "${campaign.name}"? ${leads} לידים יישארו בלי קמפיין, וההוצאות שלו יימחקו.`)) return;
    await deleteCampaign(campaign.id);
  }

  return (
    <li className={`border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 ${campaign.archived ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== campaign.name && updateCampaign(campaign.id, { name: name.trim() })}
          className={`${input} flex-1 min-w-48 font-medium`}
          title={campaign.name}
        />
        <select value={campaign.platform} onChange={(e) => updateCampaign(campaign.id, { platform: e.target.value })} className={input}>
          {!PLATFORMS.some((p) => p.id === campaign.platform) && <option value={campaign.platform}>{platformLabel(campaign.platform)}</option>}
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          value={agency}
          onChange={(e) => setAgency(e.target.value)}
          onBlur={() => agency !== (campaign.agency ?? "") && updateCampaign(campaign.id, { agency: agency.trim() || undefined })}
          placeholder="סוכנות"
          list="agencies"
          className={`${input} w-32`}
        />
        <span className="text-xs text-neutral-500 w-16 text-center">{leads} לידים</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-400">
        {campaign.externalId && <span dir="ltr">ID {campaign.externalId}</span>}
        <button onClick={() => updateCampaign(campaign.id, { archived: !campaign.archived })} className="hover:underline">
          {campaign.archived ? "החזרה מהארכיון" : "העברה לארכיון"}
        </button>
        <button onClick={() => setMerging((v) => !v)} className="hover:underline">
          איחוד לקמפיין אחר
        </button>
        {isAdmin && (
          <button onClick={handleDelete} className="hover:underline hover:text-red-500">
            מחיקה
          </button>
        )}
        {merging && (
          <span className="flex items-center gap-1">
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={input}>
              <option value="">בחירת קמפיין יעד…</option>
              {others
                .filter((o) => o.id !== campaign.id)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({platformLabel(o.platform)})
                  </option>
                ))}
            </select>
            <button onClick={handleMerge} disabled={!target} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 disabled:opacity-40">
              איחוד
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
