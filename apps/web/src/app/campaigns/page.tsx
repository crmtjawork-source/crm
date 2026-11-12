"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
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
      <Segmented className="mb-6" value={tab} onChange={setTab} options={TABS.map((t) => ({ id: t.id, label: t.label }))} />
      {tab === "report" && <ReportTab />}
      {tab === "campaigns" && <CampaignsTab isAdmin={isAdmin} />}
      {tab === "spend" && <SpendTab isAdmin={isAdmin} />}
      {tab === "sources" && <SourcesTab isAdmin={isAdmin} />}
    </div>
  );
}
