"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotificationsBell } from "./NotificationsBell";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

const ROLE_LABELS = { owner: "בעלים", admin: "מנהל", agent: "נציג" } as const;

const NAV = [
  { href: "/dashboard", label: "לוח בקרה" },
  { href: "/contacts", label: "לידים" },
  { href: "/inbox", label: "שיחות" },
  { href: "/pipeline", label: "פייפליין" },
  { href: "/documents", label: "הצעות והסכמים" },
  { href: "/campaigns", label: "קמפיינים" },
  { href: "/calendar", label: "יומן" },
  { href: "/automations", label: "אוטומציות" },
  { href: "/forms", label: "טפסים" },
  { href: "/tasks", label: "משימות" },
  { href: "/team", label: "צוות" },
  { href: "/settings", label: "הגדרות" },
];

const MOBILE_TABS = [
  { href: "/contacts", label: "לידים", icon: "👤" },
  { href: "/tasks", label: "משימות", icon: "✓" },
  { href: "/calendar", label: "יומן", icon: "📅" },
  { href: "/pipeline", label: "פייפליין", icon: "▦" },
];

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
  const { members, currentMemberId, loading, objectTypes } = useStore();
  const { session, signOut } = useAuth();
  const currentMember = members.find((m) => m.id === currentMemberId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Navigating closes the mobile menu.
    setLastPath(pathname);
    setMenuOpen(false);
  }

  // The business's own objects sit right after leads.
  const nav = [NAV[0], NAV[1], ...objectTypes.map((t) => ({ href: `/o/${t.id}`, label: `${t.icon ? `${t.icon} ` : ""}${t.name}` })), ...NAV.slice(2)];
  const navLinks = (
    <nav className="flex flex-col gap-1 px-2">
      {nav.map((item) => {
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
    </nav>
  );

  const footer = (
    <div className="mt-auto px-2 pb-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
      <NotificationsBell />
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-xs text-neutral-400 truncate">
          {currentMember ? `${currentMember.name} · ${ROLE_LABELS[currentMember.role]}` : session?.user.email}
        </span>
        <button onClick={signOut} className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline shrink-0">
          יציאה
        </button>
      </div>
    </div>
  );

  return (
    <div className="md:flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-e border-neutral-200 dark:border-neutral-800 flex-col sticky top-0 h-dvh">
        <div className="px-4 py-4 font-bold text-lg">CRM</div>
        <SearchBox />
        {navLinks}
        {footer}
      </aside>

      {/* Phone: top bar + slide-in menu + bottom tabs */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 h-12 border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
        <button onClick={() => setMenuOpen(true)} aria-label="תפריט" className="text-xl px-1">
          ☰
        </button>
        <span className="font-bold">CRM</span>
      </header>
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button aria-label="סגירת התפריט" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 start-0 w-64 bg-white dark:bg-neutral-950 flex flex-col pt-3 shadow-xl">
            <SearchBox />
            {navLinks}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 pb-16 md:pb-0">{loading ? <div className="p-6 text-sm text-neutral-400">טוען…</div> : children}</div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-4 border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {MOBILE_TABS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center py-2 text-[11px] ${active ? "text-neutral-900 dark:text-white font-semibold" : "text-neutral-400"}`}>
              <span className="text-lg leading-none mb-0.5">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
