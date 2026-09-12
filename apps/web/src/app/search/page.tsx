"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";

function SearchResults() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const { contacts, opportunities, tasks } = useStore();
  const [q, setQ] = useState(initialQ);

  const needle = q.trim().toLowerCase();
  const matchedContacts = needle
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.phone?.toLowerCase().includes(needle) ||
          c.email?.toLowerCase().includes(needle) ||
          c.tags.some((t) => t.toLowerCase().includes(needle))
      )
    : [];
  const matchedOpportunities = needle
    ? opportunities.filter((o) => o.title.toLowerCase().includes(needle))
    : [];
  const matchedTasks = needle ? tasks.filter((t) => t.title.toLowerCase().includes(needle)) : [];

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-4">חיפוש</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש בלידים, הזדמנויות ומשימות…"
        autoFocus
        className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent mb-6"
      />

      {!needle ? (
        <p className="text-sm text-neutral-400">הקלידו כדי לחפש.</p>
      ) : (
        <div className="space-y-6">
          <ResultSection title="לידים" count={matchedContacts.length}>
            {matchedContacts.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="block text-sm px-3 py-2 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="text-neutral-500" dir="ltr"> · {c.phone}</span>}
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="הזדמנויות" count={matchedOpportunities.length}>
            {matchedOpportunities.map((o) => {
              const contact = contacts.find((c) => c.id === o.contactId);
              return (
                <Link
                  key={o.id}
                  href={contact ? `/contacts/${contact.id}` : "/pipeline"}
                  className="block text-sm px-3 py-2 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="font-medium">{o.title}</span>
                  {o.value > 0 && <span className="text-neutral-500"> · ₪{o.value.toLocaleString("he-IL")}</span>}
                </Link>
              );
            })}
          </ResultSection>

          <ResultSection title="משימות" count={matchedTasks.length}>
            {matchedTasks.map((t) => (
              <Link
                key={t.id}
                href={t.contactId ? `/contacts/${t.contactId}` : "/tasks"}
                className="block text-sm px-3 py-2 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                {t.title}
              </Link>
            ))}
          </ResultSection>
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-500 mb-2">
        {title} <span className="text-neutral-400">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-neutral-400 px-3">אין תוצאות.</p>
      ) : (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-900">
          {children}
        </div>
      )}
    </section>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-400">טוען…</div>}>
      <SearchResults />
    </Suspense>
  );
}
