"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TopBarButtons } from "./TopBar";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { canSeeHref, effectiveRole, screenOf } from "@/lib/permissions";

const ROLE_LABELS = { owner: "בעלים", admin: "מנהל", agent: "נציג" } as const;

const NAV = [
  { href: "/dashboard", label: "לוח בקרה" },
  { href: "/contacts", label: "לידים" },
  { href: "/inbox", label: "וואטסאפ חברה" },
  { href: "/my-whatsapp", label: "וואטסאפ אישי" },
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
  const { members, currentMemberId, loading, objectTypes, objectCategories, roles } = useStore();
  const { session, signOut } = useAuth();
  const currentMember = members.find((m) => m.id === currentMemberId);

  const [menuOpen, setMenuOpen] = useState(false);
  // Which menu categories the user opened / closed (kept in this browser).
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("crm-menu-categories") ?? "{}");
    } catch {
      return {};
    }
  });
  const toggleCat = (id: string, open: boolean) => {
    const next = { ...openCats, [id]: open };
    setOpenCats(next);
    try {
      localStorage.setItem("crm-menu-categories", JSON.stringify(next));
    } catch {
      // not remembered
    }
  };
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Navigating closes the mobile menu.
    setLastPath(pathname);
    setMenuOpen(false);
  }

  // The business's own objects sit right after leads.
  const role = effectiveRole(currentMember, roles);
  // The leads list isn't in the menu — the pipeline table covers it (the
  // page itself stays reachable from the pipeline).
  const pipelineItem = NAV.find((i) => i.href === "/pipeline")!;
  const tableItem = (t: (typeof objectTypes)[number]) => ({ href: `/o/${t.id}`, label: `${t.icon ? `${t.icon} ` : ""}${t.name}` });
  const visible = (item: { href: string }) => canSeeHref(role, item.href);
  // Custom tables: those in a category sit in a collapsible group, the rest stay loose.
  const groups = objectCategories
    .map((c) => ({ category: c, items: objectTypes.filter((t) => t.categoryId === c.id).map(tableItem).filter(visible) }))
    .filter((g) => g.items.length > 0);
  const looseTables = objectTypes.filter((t) => !t.categoryId || !objectCategories.some((c) => c.id === t.categoryId)).map(tableItem);
  const before = [NAV[0], pipelineItem].filter(visible);
  const after = [...looseTables, ...NAV.slice(1).filter((i) => i.href !== "/contacts" && i.href !== "/pipeline")].filter(visible);

  const link = (item: { href: string; label: string }, nested = false) => {
    // A lead's card belongs to the pipeline entry.
    const active = pathname.startsWith(item.href) || (item.href === "/pipeline" && pathname.startsWith("/contacts"));
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`rounded-md px-3 py-2 text-sm ${nested ? "py-1.5" : ""} ${
          active
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
        }`}
      >
        {item.label}
      </Link>
    );
  };

  const navLinks = (
    // Scrolls on its own when the menu is taller than the screen.
    <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-1 px-2 pb-2">
      {before.map((item) => link(item))}
      {groups.map(({ category, items }) => {
        const hasActive = items.some((i) => pathname.startsWith(i.href));
        const open = openCats[category.id] ?? hasActive;
        return (
          <div key={category.id}>
            <button
              onClick={() => toggleCat(category.id, !open)}
              aria-expanded={open}
              className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              <span>
                {category.icon ? `${category.icon} ` : ""}
                {category.name}
              </span>
              <span className="text-xs">{open ? "▾" : "▸"}</span>
            </button>
            {open && <div className="flex flex-col gap-1 ms-3 ps-2 border-s border-neutral-200 dark:border-neutral-800">{items.map((item) => link(item, true))}</div>}
          </div>
        );
      })}
      {after.map((item) => link(item))}
    </nav>
  );

  const footer = (
    <div className="mt-auto px-2 pb-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
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
        <div className="ms-auto">
          <TopBarButtons />
        </div>
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

      <div className="flex-1 min-w-0 pb-16 md:pb-0">
        {/* Desktop top bar: agenda + notifications */}
        <div className="hidden md:flex sticky top-0 z-20 h-12 items-center justify-end px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur">
          <TopBarButtons />
        </div>
        {loading ? (
          <div className="p-6 text-sm text-neutral-400">טוען…</div>
        ) : !canSeeHref(role, screenOf(pathname)) ? (
          <div className="p-6 text-sm text-neutral-500">אין לך הרשאה למסך הזה. אפשר לפנות למנהל המערכת.</div>
        ) : (
          children
        )}
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-3 border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {MOBILE_TABS.filter((item) => canSeeHref(role, item.href)).map((item) => {
          const active = pathname.startsWith(item.href) || (item.href === "/pipeline" && pathname.startsWith("/contacts"));
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
