"use client";

import { useStore } from "@/lib/store";
import { colorAt } from "@/components/ui/ColorChip";
import type { Contact } from "@/lib/types";

// The lead's handling status as a coloured pill that doubles as the control to
// change it — same behaviour as on the lead card (automations on status run).
export function StatusSelect({ contact }: { contact: Contact }) {
  const { leadStatuses, setHandlingStatus } = useStore();
  const i = leadStatuses.findIndex((st) => st.name === contact.handlingStatus);
  const color = i >= 0 ? colorAt(leadStatuses[i].color, i) : "#94a3b8";
  if (leadStatuses.length === 0) return <span className="text-neutral-400">—</span>;
  return (
    // Don't let a click start a card drag or open the card behind it.
    <span
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="relative inline-flex items-center gap-1 rounded-full ps-2 pe-1 py-0.5 text-xs whitespace-nowrap"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <select
        value={contact.handlingStatus ?? ""}
        aria-label="סטטוס ליד"
        onChange={(e) => setHandlingStatus(contact.id, e.target.value || null)}
        className="appearance-none bg-transparent outline-none cursor-pointer pe-1 py-0.5 text-xs"
        style={{ color }}
      >
        <option value="">ללא סטטוס</option>
        {leadStatuses.map((st) => (
          <option key={st.id} value={st.name}>
            {st.name}
          </option>
        ))}
        {/* A status that was removed from the list stays visible until changed. */}
        {contact.handlingStatus && i < 0 && <option value={contact.handlingStatus}>{contact.handlingStatus}</option>}
      </select>
    </span>
  );
}
