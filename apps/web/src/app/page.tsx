"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { canAssignLeads, canSeeHref, effectiveRole } from "@/lib/permissions";
import { needsAssignment } from "@/components/leads/OwnerSelect";

// Where a person lands: someone who assigns leads goes straight to the new
// leads nobody owns yet; everyone else to the pipeline (or the first screen
// their role includes).
export default function Home() {
  const router = useRouter();
  const { loading, contacts, members, currentMemberId, roles } = useStore();

  useEffect(() => {
    if (loading) return;
    const me = members.find((m) => m.id === currentMemberId);
    const role = effectiveRole(me, roles);
    if (canAssignLeads(me, role) && canSeeHref(role, "/contacts") && contacts.some(needsAssignment)) return router.replace("/contacts?new=1");
    const first = ["/pipeline", "/dashboard", "/tasks", "/calendar", "/inbox", "/documents"].find((href) => canSeeHref(role, href));
    router.replace(first ?? "/settings");
  }, [loading, contacts, members, currentMemberId, roles, router]);

  return <div className="p-6 text-sm text-neutral-400">טוען…</div>;
}
