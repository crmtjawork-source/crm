"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getLeadNav } from "@/lib/leadNav";

// Previous / next lead of the list the user came from. Hidden when this lead
// isn't in that list (opened from search, a link, another tab…).
export function LeadStepper({ contactId }: { contactId: string }) {
  const router = useRouter();
  const { getContact } = useStore();
  const ids = getLeadNav().filter((id) => id === contactId || getContact(id));
  const i = ids.indexOf(contactId);
  if (i < 0 || ids.length < 2) return null;
  const prev = ids[i - 1];
  const next = ids[i + 1];
  const go = (id: string | undefined) => id && router.replace(`/contacts/${id}`);
  const btn = "inline-flex items-center gap-1 px-2.5 py-1 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-2 mb-3 ms-auto">
      <button onClick={() => go(prev)} disabled={!prev} className={btn} aria-label="הליד הקודם" title="הליד הקודם ברשימה">
        <span aria-hidden="true">→</span> הקודם
      </button>
      <span className="text-xs text-neutral-500 tabular-nums">
        {i + 1} מתוך {ids.length}
      </span>
      <button onClick={() => go(next)} disabled={!next} className={btn} aria-label="הליד הבא" title="הליד הבא ברשימה">
        הבא <span aria-hidden="true">←</span>
      </button>
    </div>
  );
}
