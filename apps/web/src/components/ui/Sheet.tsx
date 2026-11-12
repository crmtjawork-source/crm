"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const CLOSE_MS = 200;

// Bottom sheet on a phone (drag the handle down to dismiss), centred dialog on a wider screen.
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [close]);

  // Phone: dragging the handle moves the sheet; a far or quick pull down closes it.
  function onDown(e: React.PointerEvent) {
    if (drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startT: Date.now(), dy: 0 };
    if (panel.current) panel.current.style.animation = "none";
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !panel.current) return;
    const raw = e.clientY - d.startY;
    // Friction when pulled up past the resting position.
    d.dy = raw < 0 ? raw / 6 : raw;
    panel.current.style.transform = `translateY(${d.dy}px)`;
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    const velocity = d.dy / Math.max(1, Date.now() - d.startT);
    if (d.dy > 110 || velocity > 0.5) {
      setClosing(true);
      panel.current.style.transition = `transform ${CLOSE_MS}ms var(--ease-out)`;
      panel.current.style.transform = "translateY(100%)";
      window.setTimeout(onClose, CLOSE_MS);
    } else {
      panel.current.style.transition = "transform 260ms var(--ease-sheet)";
      panel.current.style.transform = "translateY(0)";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="סגירה" onClick={close} data-closing={closing} className="overlay-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        ref={panel}
        data-closing={closing}
        className={`overlay-panel relative w-full ${wide ? "md:max-w-3xl" : "md:max-w-lg"} max-h-[90dvh] overflow-y-auto bg-white dark:bg-neutral-900 rounded-t-3xl md:rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl`}
      >
        <div
          className="md:hidden -mt-2 mb-1 flex justify-center py-2 touch-none cursor-grab"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-hidden
        >
          <span className="h-1.5 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={close} className="grid h-8 w-8 place-items-center rounded-full bg-black/[.06] dark:bg-white/10 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-100" aria-label="סגירה">
            <X size={16} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
