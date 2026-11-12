"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

// A linked WhatsApp that is no longer connected — shown on every screen, so a
// dropped connection is noticed straight away instead of when messages go
// missing. Re-checks the channel status every minute and when the tab regains focus.
export function WhatsAppDownBanner() {
  const { channels, reloadIntegrations } = useStore();

  useEffect(() => {
    const run = () => void reloadIntegrations();
    const timer = setInterval(run, 60_000);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [reloadIntegrations]);

  const down = channels.filter((c) => c.provider === "evolution" && c.active && c.displayPhone && c.status && c.status !== "authorized");
  if (!down.length) return null;
  return (
    <div className="px-4 md:px-6 pt-3 space-y-2">
      {down.map((c) => (
        <Link
          key={c.id}
          href={c.ownerMembershipId ? "/my-whatsapp" : "/settings/integrations"}
          className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-3 py-2 text-sm text-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-950/50"
        >
          <span>🔌</span>
          <span className="flex-1">
            {c.ownerMembershipId ? "הוואטסאפ האישי" : "וואטסאפ החברה"} <span dir="ltr">({c.displayPhone})</span> מנותק — הודעות לא נקלטות ואוטומציות לא נשלחות.
          </span>
          <span className="text-xs underline shrink-0">חיבור מחדש ‹</span>
        </Link>
      ))}
    </div>
  );
}
