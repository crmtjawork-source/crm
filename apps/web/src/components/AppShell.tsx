"use client";

import { useState } from "react";
import { PageSkeleton } from "@/components/ui/Skeleton";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TopBarButtons } from "./TopBar";
import { RecentSearchInput } from "./RecentSearchInput";
import { NewLeadsBanner } from "./NewLeadsBanner";
import { NewVersionBanner } from "./NewVersionBanner";
import { WhatsAppDownBanner } from "./WhatsAppDownBanner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { canSeeHref, effectiveRole, screenOf } from "@/lib/permissions";
import { CalendarDays, CheckSquare, ClipboardList, FileText, Home, Kanban, Megaphone, MessageCircle, SlidersHorizontal, Table2, Menu, Users, Zap, type LucideIcon } from "lucide-react";

// Each section gets a rounded colour tile; the colours are the design's fixed palette.
const NAV_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  "/dashboard": { icon: Home, color: "#0a84ff" },
  "/pipeline": { icon: Kanban, color: "#ff9f0a" },
  "/documents": { icon: FileText, color: "#bf5af2" },
  "/inbox": { icon: MessageCircle, color: "#30d158" },
  "/my-whatsapp": { icon: MessageCircle, color: "#30d158" },
  "/campaigns": { icon: Megaphone, color: "#ff375f" },
  "/calendar": { icon: CalendarDays, color: "#ff3b30" },
  "/automations": { icon: Zap, color: "#5e5ce6" },
  "/forms": { icon: ClipboardList, color: "#64d2ff" },
  "/tasks": { icon: CheckSquare, color: "#5e5ce6" },
  "/team": { icon: Users, color: "#64d2ff" },
  "/settings": { icon: SlidersHorizontal, color: "#8e8e93" },
};

function NavIcon({ href }: { href: string }) {
  const meta = NAV_ICONS[href] ?? { icon: Table2, color: "#8e8e93" };
  const Icon = meta.icon;
  return (
    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-white" style={{ backgroundColor: meta.color }}>
      <Icon size={14} strokeWidth={2.2} aria-hidden />
    </span>
  );
}

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

const MOBILE_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/tasks", label: "משימות", icon: CheckSquare },
  { href: "/calendar", label: "יומן", icon: CalendarDays },
  { href: "/pipeline", label: "פייפליין", icon: Kanban },
];

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const go = (term: string) => {
    if (term.trim()) router.push(`/search?q=${encodeURIComponent(term.trim())}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className="px-2 mb-2"
    >
      <RecentSearchInput value={q} onChange={setQ} onPick={go} placeholder="חיפוש…" />
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
  // Without the business-settings permission "settings" is only the person's own (notifications, calendar, WhatsApp, appearance).
  const businessSettings = !role || !role.features || role.features.includes("settings");
  const after = [...looseTables, ...NAV.slice(1).filter((i) => i.href !== "/contacts" && i.href !== "/pipeline")]
    .filter(visible)
    .map((i) => (i.href === "/settings" && !businessSettings ? { ...i, label: "ההגדרות שלי" } : i));

  const link = (item: { href: string; label: string }, nested = false) => {
    // A lead's card belongs to the pipeline entry.
    const active = pathname.startsWith(item.href) || (item.href === "/pipeline" && pathname.startsWith("/contacts"));
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 min-h-9 text-sm font-medium transition-colors duration-150 ${nested ? "min-h-8" : ""} ${
          active ? "bg-black/[.07] dark:bg-white/10" : "text-neutral-700 hover:bg-black/[.04] dark:text-neutral-300 dark:hover:bg-white/[.06]"
        }`}
      >
        {!nested && <NavIcon href={item.href} />}
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const navLinks = (
    // Scrolls on its own when the menu is taller than the screen.
    <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-1 px-2 pb-2">
      {/* Until the person's role has loaded, show no items — otherwise everyone briefly sees the full manager menu. */}
      {loading &&
        [0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 rounded-md bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
        ))}
      {!loading && before.map((item) => link(item))}
      {!loading && groups.map(({ category, items }) => {
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
      {!loading && after.map((item) => link(item))}
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
      <aside className="hidden md:flex w-60 shrink-0 border-e border-black/[.08] dark:border-white/10 bg-neutral-100/70 dark:bg-neutral-900/60 backdrop-blur-xl flex-col sticky top-0 h-dvh">
        <div className="px-4 pt-5 pb-3 flex items-center gap-2.5 font-semibold text-[15px]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-b from-[#5db0ff] to-tint text-white text-sm font-bold">C</span>CRM</div>
        <SearchBox />
        {navLinks}
        {footer}
      </aside>

      {/* Phone: top bar + slide-in menu + bottom tabs */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 h-12 border-b border-neutral-200 dark:border-neutral-800 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-xl">
        <button onClick={() => setMenuOpen(true)} aria-label="תפריט" className="px-1 min-h-11 min-w-9"><Menu size={22} aria-hidden /></button>
        <span className="font-bold">CRM</span>
        <div className="ms-auto">
          <TopBarButtons />
        </div>
      </header>
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button aria-label="סגירת התפריט" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 start-0 w-64 bg-neutral-100 dark:bg-neutral-900 flex flex-col pt-3 shadow-xl">
            <SearchBox />
            {navLinks}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 pb-16 md:pb-0">
        {/* Desktop top bar: agenda + notifications */}
        <div className="hidden md:flex sticky top-0 z-20 h-12 items-center justify-end px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl">
          <TopBarButtons />
        </div>
        {loading ? (
          <PageSkeleton />
        ) : !canSeeHref(role, screenOf(pathname)) ? (
          <div className="p-6 text-sm text-neutral-500">אין לך הרשאה למסך הזה. אפשר לפנות למנהל המערכת.</div>
        ) : (
          <>
            <WhatsAppDownBanner />
            <NewVersionBanner />
            <NewLeadsBanner />
            {children}
          </>
        )}
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-3 border-t border-neutral-200 dark:border-neutral-800 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        {(loading ? [] : MOBILE_TABS.filter((item) => canSeeHref(role, item.href))).map((item) => {
          const active = pathname.startsWith(item.href) || (item.href === "/pipeline" && pathname.startsWith("/contacts"));
          return (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center py-2 text-[11px] ${active ? "text-tint font-semibold" : "text-neutral-400"}`}>
              <item.icon size={22} strokeWidth={active ? 2.3 : 1.9} className="mb-0.5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
