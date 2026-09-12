"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotificationsBell } from "./NotificationsBell";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/dashboard", label: "לוח בקרה" },
  { href: "/contacts", label: "לידים" },
  { href: "/pipeline", label: "פייפליין" },
  { href: "/calendar", label: "יומן" },
  { href: "/automations", label: "אוטומציות" },
  { href: "/forms", label: "טפסים" },
  { href: "/tasks", label: "משימות" },
  { href: "/team", label: "צוות" },
  { href: "/settings", label: "הגדרות" },
];

const NAV_SOON = ["שיחות"];

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="px-2 mb-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש…"
        className="w-full px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
      />
    </form>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { members, currentMemberId } = useStore();
  const currentMember = members.find((m) => m.id === currentMemberId);

  return (
    <div className="flex min-h-full">
      <aside className="w-56 shrink-0 border-e border-neutral-200 dark:border-neutral-800 flex flex-col">
        <div className="px-4 py-4 font-bold text-lg">CRM</div>
        <SearchBox />
        <nav className="flex flex-col gap-1 px-2">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-4 px-3 text-xs text-neutral-400">בקרוב</div>
          {NAV_SOON.map((label) => (
            <div key={label} className="rounded-md px-3 py-2 text-sm text-neutral-400 cursor-not-allowed">
              {label}
            </div>
          ))}
        </nav>
        <div className="mt-auto px-2 pb-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
          <NotificationsBell />
          {currentMember && (
            <Link href="/team" className="block px-3 py-1 text-xs text-neutral-400 hover:underline">
              מציג כ{currentMember.name} ({currentMember.role === "owner" ? "בעלים" : currentMember.role === "admin" ? "מנהל" : "נציג"})
            </Link>
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
