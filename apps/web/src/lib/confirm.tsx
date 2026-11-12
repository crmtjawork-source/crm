"use client";

import { useEffect, useRef, useState } from "react";

// A confirmation that looks like part of the app (instead of the browser's own dialog).
//   if (!(await confirmAction("למחוק את הליד?"))) return;
// <ConfirmHost /> is mounted once in the root layout.

type Options = { confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type Request = { message: string; options: Options; resolve: (ok: boolean) => void };

let push: ((r: Request) => void) | null = null;

export function confirmAction(message: string, options: Options = {}): Promise<boolean> {
  if (!push) return Promise.resolve(window.confirm(message)); // host not mounted yet
  return new Promise((resolve) => push!({ message, options, resolve }));
}

// The wording of the button follows the sentence ("למחוק…" → "מחיקה").
function labelFor(message: string): { label: string; destructive: boolean } {
  if (/^למחוק/.test(message)) return { label: "מחיקה", destructive: true };
  if (/^להסיר/.test(message)) return { label: "הסרה", destructive: true };
  if (/^לנתק|^להתנתק/.test(message)) return { label: "ניתוק", destructive: true };
  if (/^לבטל/.test(message)) return { label: "ביטול", destructive: true };
  if (/^לאחד/.test(message)) return { label: "איחוד", destructive: false };
  return { label: "אישור", destructive: false };
}

const CLOSE_MS = 160;

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [closing, setClosing] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    push = (r) => {
      setClosing(false);
      setReq(r);
    };
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && answer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  function answer(ok: boolean) {
    const r = req;
    if (!r || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setReq(null);
      r.resolve(ok);
    }, CLOSE_MS);
  }

  if (!req) return null;
  const auto = labelFor(req.message);
  const destructive = req.options.destructive ?? auto.destructive;
  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-3" role="alertdialog" aria-modal="true" aria-label={req.message}>
      <div data-closing={closing} onClick={() => answer(false)} className="overlay-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div data-closing={closing} className="overlay-panel relative w-full md:max-w-sm rounded-3xl md:rounded-2xl bg-white dark:bg-neutral-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <p className="text-[15px] leading-relaxed text-center whitespace-pre-line">{req.message}</p>
        <div className="mt-5 grid gap-2">
          <button
            onClick={() => answer(true)}
            className={`min-h-11 rounded-xl text-[15px] font-semibold text-white ${destructive ? "bg-red-500" : "bg-tint"}`}
          >
            {req.options.confirmLabel ?? auto.label}
          </button>
          <button ref={cancelRef} onClick={() => answer(false)} className="min-h-11 rounded-xl text-[15px] font-medium bg-black/[.06] dark:bg-white/10">
            {req.options.cancelLabel ?? "ביטול"}
          </button>
        </div>
      </div>
    </div>
  );
}
