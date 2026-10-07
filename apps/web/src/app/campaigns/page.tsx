"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { ReportTab } from "@/components/campaigns/ReportTab";
import { CampaignsTab } from "@/components/campaigns/CampaignsTab";
import { SpendTab } from "@/components/campaigns/SpendTab";
import { SourcesTab } from "@/components/campaigns/SourcesTab";

const TABS = [
  { id: "report", label: "דוח ביצועים" },
  { id: "campaigns", label: "קמפיינים" },
  { id: "spend", label: "הוצאות" },
  { id: "sources", label: "קליטת לידים" },
] as const;

export default function CampaignsPage() {
  const { members, currentMemberId } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("report");
  const isAdmin = members.find((m) => m.id === currentMemberId)?.role !== "agent";

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold mb-4">קמפיינים</h1>
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              tab === t.id ? "border-neutral-900 dark:border-white font-medium" : "border-transparent text-neutral-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "report" && <ReportTab />}
      {tab === "campaigns" && <CampaignsTab isAdmin={isAdmin} />}
      {tab === "spend" && <SpendTab isAdmin={isAdmin} />}
      {tab === "sources" && <SourcesTab isAdmin={isAdmin} />}
    </div>
  );
}
