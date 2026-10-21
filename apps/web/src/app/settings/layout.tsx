"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { effectiveRole } from "@/lib/permissions";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";

// Settings has its own sidebar: one page per topic instead of one long page.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { members, currentMemberId, roles } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  // Personal settings are for everyone; the business's only for roles that include them.
  const role = effectiveRole(me, roles);
  const businessSettings = !role || !role.features || role.features.includes("settings");
  const sections = SETTINGS_SECTIONS.filter((s) => businessSettings || !s.business);
  const groups = [...new Set(sections.map((s) => s.group))];

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold mb-4">הגדרות</h1>
      <div className="md:flex md:gap-8">
        <nav className="md:w-52 md:shrink-0 mb-5 md:mb-0 md:sticky md:top-16 md:self-start">
          {/* Phone: one scrollable row of pills. Desktop: grouped list. */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {sections.map((s) => {
              const active = pathname === `/settings/${s.slug}`;
              return (
                <Link
                  key={s.slug}
                  href={`/settings/${s.slug}`}
                  className={`shrink-0 text-sm px-3 py-1.5 rounded-full border ${
                    active ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"
                  }`}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
          <div className="hidden md:block space-y-5">
            {groups.map((g) => (
              <div key={g}>
                <p className="text-xs font-medium text-neutral-400 px-3 mb-1">{g}</p>
                <div className="flex flex-col gap-0.5">
                  {sections
                    .filter((s) => s.group === g)
                    .map((s) => {
                      const active = pathname === `/settings/${s.slug}`;
                      return (
                        <Link
                          key={s.slug}
                          href={`/settings/${s.slug}`}
                          className={`rounded-md px-3 py-1.5 text-sm ${
                            active
                              ? "bg-neutral-100 dark:bg-neutral-900 font-medium"
                              : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-900"
                          }`}
                        >
                          {s.label}
                        </Link>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </nav>
        <div className="flex-1 min-w-0 max-w-2xl">{children}</div>
      </div>
    </div>
  );
}
