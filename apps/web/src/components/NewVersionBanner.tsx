"use client";

import { useEffect, useState } from "react";

const mine = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

// A tab that stays open for days keeps running the version it loaded. When a
// newer one is live, say so — one click reloads.
export function NewVersionBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!mine) return;
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        if (build && build !== mine) setStale(true);
      } catch {
        // offline: try again later
      }
    }
    const timer = setInterval(check, 5 * 60_000);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    void check();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="px-4 md:px-6 pt-3">
      <button onClick={() => window.location.reload()} className="w-full flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 px-3 py-2 text-sm text-sky-900 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-950/50 text-start">
        <span>⟳</span>
        <span className="flex-1">יצאה גרסה חדשה של המערכת — לחצו לרענון כדי לקבל אותה</span>
        <span className="text-xs underline">רענון</span>
      </button>
    </div>
  );
}
