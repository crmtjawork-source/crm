"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { canAssignLeads, effectiveRole } from "@/lib/permissions";
import { needsAssignment } from "@/components/leads/OwnerSelect";

// "N new leads waiting to be assigned" — shown on every screen for people who
// can assign leads, and kept live by the store, so a new lead is noticed
// wherever they are (no refresh, no need to be on the pipeline).
export function NewLeadsBanner() {
  const { contacts, members, currentMemberId, roles } = useStore();
  const pathname = usePathname();
  const me = members.find((m) => m.id === currentMemberId);
  const unassigned = canAssignLeads(me, effectiveRole(me, roles)) ? contacts.filter(needsAssignment).length : 0;
  // The leads list has its own notice for this.
  if (unassigned === 0 || pathname === "/contacts") return null;
  return (
    <div className="px-4 md:px-6 pt-3">
      <Link
        href="/contacts?new=1"
        className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/50"
      >
        <span>⚠</span>
        <span className="flex-1">{unassigned} {unassigned === 1 ? "ליד חדש ממתין" : "לידים חדשים ממתינים"} לשיוך לנציג</span>
        <span className="text-xs underline">הצגה ‹</span>
      </Link>
    </div>
  );
}
