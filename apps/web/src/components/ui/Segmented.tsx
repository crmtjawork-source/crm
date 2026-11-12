"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type SegmentOption<T extends string> = { id: T; label: string; badge?: number; badgeTone?: "alert" };

// A segmented control: the highlight slides to the chosen option.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className = "",
}: {
  value: T;
  onChange: (id: T) => void;
  options: SegmentOption<T>[];
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    const t = window.setTimeout(() => setAnimate(true), 0); // no slide on first paint
    return () => window.clearTimeout(t);
  }, [value, options.length]);

  return (
    <div role="tablist" className={`relative inline-flex max-w-full overflow-x-auto rounded-xl bg-black/[.06] dark:bg-white/10 p-0.5 ${className}`}>
      {thumb && (
        <span
          aria-hidden
          className={`absolute top-0.5 bottom-0.5 left-0 rounded-[10px] bg-white dark:bg-neutral-600 shadow-sm ${animate ? "transition-[transform,width] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)]" : ""}`}
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[o.id] = el;
          }}
          role="tab"
          aria-selected={o.id === value}
          onClick={() => onChange(o.id)}
          className={`relative z-10 whitespace-nowrap rounded-[10px] font-medium ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
            o.id === value ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          {o.label}
          {o.badge ? <span className={`ms-1 text-[11px] ${o.badgeTone === "alert" ? "text-red-500" : "text-neutral-400"}`}>{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
