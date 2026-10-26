"use client";

import { useStore } from "@/lib/store";
import { canAssignLeads, effectiveRole } from "@/lib/permissions";
import type { Contact } from "@/lib/types";

// A lead that came in recently and nobody owns yet — the ones to assign now.
export const NEW_DAYS = 14;
export const needsAssignment = (c: Contact) => !c.ownerEmail && Date.now() - new Date(c.createdAt).getTime() < NEW_DAYS * 86400000;

// The lead's owner. People who may assign leads get a dropdown right in the
// table; everyone else sees the name. An unowned new lead is flagged amber.
export function OwnerSelect({ contact }: { contact: Contact }) {
  const { members, currentMemberId, roles, updateContact } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const can = canAssignLeads(me, effectiveRole(me, roles));
  const owner = contact.ownerEmail?.toLowerCase() ?? "";
  const ownerName = owner ? members.find((m) => m.email.toLowerCase() === owner)?.name ?? owner : "";
  const flagged = needsAssignment(contact);

  if (!can)
    return flagged ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">ללא בעלים</span> : <span className="text-neutral-600 dark:text-neutral-400">{ownerName || "—"}</span>;

  return (
    <select
      value={owner}
      aria-label="בעלים"
      onChange={(e) => updateContact(contact.id, { ownerEmail: e.target.value || undefined })}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={`text-sm rounded-md border bg-transparent px-1.5 py-1 max-w-36 ${
        flagged ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-medium" : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-400"
      }`}
    >
      <option value="">{flagged ? "⚠ לשייך…" : "ללא בעלים"}</option>
      {members
        .filter((m) => m.status === "active" || m.email.toLowerCase() === owner)
        .map((m) => (
          <option key={m.id} value={m.email.toLowerCase()}>
            {m.name}
          </option>
        ))}
      {owner && !members.some((m) => m.email.toLowerCase() === owner) && <option value={owner}>{owner}</option>}
    </select>
  );
}
