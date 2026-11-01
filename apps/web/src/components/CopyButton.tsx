"use client";

import { useState } from "react";

// Copies text to the clipboard and shows a brief ✓. Works over plain http too
// (falls back to a hidden textarea).
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function CopyButton({ text, label = "העתקה", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await copyText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={`inline-flex items-center justify-center shrink-0 rounded px-1 text-xs leading-none text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 ${done ? "text-emerald-600" : ""} ${className}`}
    >
      {done ? "✓" : "⧉"}
    </button>
  );
}
