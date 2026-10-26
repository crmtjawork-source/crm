"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Contact, Opportunity } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";

const input = "w-full px-2 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

// The pencil on a pipeline card / row: edit the lead's details and the deal's
// value in one window, without leaving the pipeline.
export function EditLeadSheet({ contact, opp, onClose }: { contact: Contact; opp: Opportunity; onClose: () => void }) {
  const { updateContact, updateOpportunity, setHandlingStatus, leadStatuses, members, currentMemberId } = useStore();
  const canAssign = members.find((m) => m.id === currentMemberId)?.role !== "agent";
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [owner, setOwner] = useState(contact.ownerEmail?.toLowerCase() ?? "");
  const [status, setStatus] = useState(contact.handlingStatus ?? "");
  const [value, setValue] = useState(String(opp.value || ""));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const patch: Parameters<typeof updateContact>[1] = { name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined };
      if (canAssign && owner !== (contact.ownerEmail?.toLowerCase() ?? "")) patch.ownerEmail = owner || undefined;
      await updateContact(contact.id, patch);
      if (status !== (contact.handlingStatus ?? "")) await setHandlingStatus(contact.id, status || null);
      // The deal's title follows the lead's name when it was just that name.
      const dealPatch: Parameters<typeof updateOpportunity>[1] = { value: Number(value) || 0 };
      if (opp.title === contact.name && name.trim() !== contact.name) dealPatch.title = name.trim();
      await updateOpportunity(opp.id, dealPatch);
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`עריכת ${contact.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">שם</span>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">טלפון</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className={input} />
          </label>
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">אימייל</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={input} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {leadStatuses.length > 0 && (
            <label className="block text-xs">
              <span className="block text-neutral-500 mb-1">סטטוס ליד</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
                <option value="">ללא סטטוס</option>
                {leadStatuses.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name}
                  </option>
                ))}
                {status && !leadStatuses.some((st) => st.name === status) && <option value={status}>{status}</option>}
              </select>
            </label>
          )}
          {canAssign && (
            <label className="block text-xs">
              <span className="block text-neutral-500 mb-1">בעלים</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
                <option value="">ללא בעלים</option>
                {members.map((m) => (
                  <option key={m.id} value={m.email.toLowerCase()}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">שווי העסקה (₪)</span>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
        </label>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50">
            {busy ? "שומר…" : "שמירה"}
          </button>
          <Link href={`/contacts/${contact.id}`} className="text-xs text-neutral-500 hover:underline">
            לכרטיס המלא
          </Link>
        </div>
      </form>
    </Sheet>
  );
}
