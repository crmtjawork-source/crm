"use client";

import { useEffect } from "react";

// Bottom sheet on a phone, centred dialog on a wider screen.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full md:max-w-lg max-h-[90dvh] overflow-y-auto bg-white dark:bg-neutral-950 rounded-t-2xl md:rounded-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xl leading-none px-2" aria-label="סגירה">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
