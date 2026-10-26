"use client";

import { useRouter } from "next/navigation";

// "Back" arrow for detail pages: returns to wherever the user came from (the
// leads list, the pipeline, search…); with no history (a pasted link, a new
// tab) it goes to the page's natural parent instead.
export function BackLink({ fallback, label = "חזרה", className = "mb-3" }: { fallback: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={`inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 ${className}`}
    >
      {/* Points right: back, in a right-to-left page. */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
      {label}
    </button>
  );
}
