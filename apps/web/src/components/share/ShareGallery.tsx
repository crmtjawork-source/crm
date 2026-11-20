"use client";

import { useCallback, useEffect, useState } from "react";

type Img = { src: string; alt: string; caption: string | null };

// Thumbnail grid with a full-screen viewer (arrows, swipe, Esc).
export function ShareGallery({ images }: { images: Img[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [touch, setTouch] = useState<number | null>(null);
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + images.length) % images.length)), [images.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowLeft") step(1); // RTL: left = next
      if (e.key === "ArrowRight") step(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, step]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {images.map((im, i) => (
          <button key={i} onClick={() => setOpen(i)} className={`relative overflow-hidden rounded-xl bg-neutral-200 aspect-[4/3] ${i === 0 ? "col-span-2 sm:col-span-2 sm:row-span-2 sm:aspect-auto" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.src} alt={im.alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 hover:scale-105" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setOpen(null)}
          onTouchStart={(e) => setTouch(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch === null) return;
            const dx = e.changedTouches[0].clientX - touch;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
            setTouch(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[open].src} alt={images[open].alt} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 start-4 text-white text-3xl leading-none" aria-label="סגירה" onClick={() => setOpen(null)}>
            ×
          </button>
          {images.length > 1 && (
            <>
              <button className="absolute start-3 top-1/2 text-white text-4xl px-2" aria-label="הבא" onClick={(e) => (e.stopPropagation(), step(1))}>
                ‹
              </button>
              <button className="absolute end-3 top-1/2 text-white text-4xl px-2" aria-label="הקודם" onClick={(e) => (e.stopPropagation(), step(-1))}>
                ›
              </button>
              <span className="absolute bottom-4 inset-x-0 text-center text-white/70 text-sm">
                {open + 1} / {images.length}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
