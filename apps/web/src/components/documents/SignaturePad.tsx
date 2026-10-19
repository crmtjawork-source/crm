"use client";

import { useEffect, useRef, useState } from "react";

// Finger / mouse signature. Reports a PNG data URL (or null when cleared).
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  function down(e: React.PointerEvent) {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    // Downscaled copy keeps the stored image small.
    const src = canvas.current!;
    const out = document.createElement("canvas");
    out.width = 600;
    out.height = Math.round((600 * src.height) / src.width);
    out.getContext("2d")!.drawImage(src, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  }

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="w-full h-40 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 touch-none cursor-crosshair"
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">חתמו כאן באצבע או בעכבר</span>}
      </div>
      <button type="button" onClick={clear} className="text-xs text-neutral-500 hover:underline mt-1">
        ניקוי
      </button>
    </div>
  );
}
