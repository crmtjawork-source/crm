"use client";

import { useEffect, useRef, useState } from "react";

const KEY = "crm-recent-searches";
const MAX = 8;

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function save(term: string) {
  const t = term.trim();
  if (t.length < 2) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([t, ...load().filter((x) => x !== t)].slice(0, MAX)));
  } catch {
    /* storage unavailable — recents are a convenience only */
  }
}

// A search box that remembers what was searched (in this browser) and, on
// focus, offers those searches to pick again. A search is saved on Enter or
// when the box loses focus.
export function RecentSearchInput({
  value,
  onChange,
  onPick,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (v: string) => void; // after a recent search is chosen (e.g. submit)
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const needle = value.trim().toLowerCase();
  const shown = recent.filter((r) => r.toLowerCase() !== needle && (!needle || r.toLowerCase().includes(needle)));

  function pick(term: string) {
    onChange(term);
    setOpen(false);
    save(term);
    onPick?.(term);
  }

  return (
    <div ref={box} className={`relative ${className ?? ""}`}>
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setRecent(load());
          setOpen(true);
        }}
        onBlur={() => save(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            save(value);
            setOpen(false);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
      />
      {open && shown.length > 0 && (
        <div className="absolute z-30 inset-x-0 top-full mt-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg py-1">
          <div className="flex items-center justify-between px-3 py-1 text-xs text-neutral-400">
            <span>חיפושים אחרונים</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                try {
                  localStorage.removeItem(KEY);
                } catch {}
                setRecent([]);
              }}
              className="hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline"
            >
              ניקוי
            </button>
          </div>
          {shown.map((r) => (
            <button
              key={r}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              className="w-full text-start px-3 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 flex items-center gap-2"
            >
              <span className="text-neutral-400">↺</span>
              <span className="truncate">{r}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
