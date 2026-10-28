"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import type { Message } from "@/lib/types";

const ORIGIN_LABELS: Record<NonNullable<Message["origin"]>, string> = {
  crm: "",
  automation: "אוטומציה",
  phone_app: "",
  history: "",
};

function StatusMark({ message }: { message: Message }) {
  if (message.direction === "inbound") return null;
  switch (message.status) {
    case "pending":
      return <span className="text-neutral-400">🕓</span>;
    case "sent":
      return <span className="text-neutral-400">✓</span>;
    case "delivered":
      return <span className="text-neutral-400">✓✓</span>;
    case "read":
      return <span className="text-sky-500">✓✓</span>;
    case "failed":
      return <span className="text-red-500" title={message.error}>⚠ נכשל</span>;
    default:
      return null;
  }
}

// Group senders get a stable colour, like in WhatsApp.
const SENDER_COLORS = ["#2563eb", "#db2777", "#16a34a", "#ca8a04", "#7c3aed", "#0891b2", "#ea580c", "#4f46e5"];
const senderColor = (name: string) => SENDER_COLORS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % SENDER_COLORS.length];

const URL_RE = /(https?:\/\/[^\s]+)/g;
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-sky-600 dark:text-sky-400 underline break-all" dir="ltr">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

const sizeLabel = (n?: number) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type Signed = { available: boolean; url?: string; mime?: string; name?: string; size?: number };
const signedCache = new Map<string, { at: number; value: Signed }>();

// A message's media, fetched when it scrolls into view (WhatsApp keeps old
// files only a while, so an old one may no longer be available).
function MediaView({ message }: { message: Message }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Signed | "loading" | "idle">(() => {
    const hit = signedCache.get(message.id);
    return hit && Date.now() - hit.at < 50 * 60_000 ? hit.value : message.mediaFailed ? { available: false } : "idle";
  });
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (state !== "idle") return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        setState("loading");
        apiPost<Signed>("/api/media/sign", { messageId: message.id })
          .then((v) => {
            signedCache.set(message.id, { at: Date.now(), value: v });
            setState(v);
          })
          .catch(() => setState({ available: false }));
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [state, message.id]);

  const icon = message.type === "image" || message.type === "sticker" ? "🖼" : message.type === "video" ? "🎥" : message.type === "voice" || message.type === "audio" ? "🎤" : "📄";
  if (state === "idle" || state === "loading")
    return (
      <div ref={ref} className="flex items-center justify-center w-56 h-32 rounded-md bg-neutral-200/60 dark:bg-neutral-800 text-neutral-400 text-2xl animate-pulse">
        {icon}
      </div>
    );
  if (!state.available || !state.url)
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500 py-1">
        <span className="text-lg">{icon}</span>
        <span>
          {message.type === "document" && message.mediaName ? `${message.mediaName} — ` : ""}
          המדיה לא זמינה (קובץ ישן שוואטסאפ כבר לא שומר)
        </span>
      </div>
    );
  const { url } = state;
  if (message.type === "image")
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" onClick={() => setZoom(true)} className="max-w-full w-64 rounded-md cursor-zoom-in" />
        {zoom && (
          <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setZoom(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </>
    );
  if (message.type === "sticker")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" className="w-32 h-32 object-contain" />;
  if (message.type === "video") return <video src={url} controls preload="metadata" className="max-w-full w-72 rounded-md" />;
  if (message.type === "voice" || message.type === "audio") return <audio src={url} controls preload="metadata" className="w-60 max-w-full" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" download={state.name ?? message.mediaName} className="flex items-center gap-3 rounded-md bg-black/5 dark:bg-white/5 px-3 py-2 hover:bg-black/10">
      <span className="text-2xl">📄</span>
      <span className="min-w-0">
        <span className="block text-sm truncate">{state.name ?? message.mediaName ?? "קובץ"}</span>
        <span className="block text-[11px] text-neutral-500">{sizeLabel(state.size ?? message.mediaSize)} · הורדה</span>
      </span>
    </a>
  );
}

const MEDIA_TYPES = new Set(["image", "video", "audio", "voice", "document", "sticker"]);

// The text that goes with media: WhatsApp's caption (our stored body is "[תמונה] caption").
const captionOf = (m: Message) => (m.body ?? "").replace(/^\[[^\]]+\]\s?/, "").replace(m.mediaName ?? "\u0000", "").trim();

export function MessageBubble({ message, showSender }: { message: Message; showSender?: boolean }) {
  const outbound = message.direction === "outbound";
  const origin = message.origin ? ORIGIN_LABELS[message.origin] : "";
  const time = new Date(message.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const isMedia = MEDIA_TYPES.has(message.type);
  const deleted = message.type === "deleted";
  const caption = isMedia ? captionOf(message) : "";

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-lg px-2.5 py-1.5 text-sm break-words shadow-sm ${
          outbound ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
        } ${message.status === "failed" ? "border border-red-300 dark:border-red-800" : ""}`}
      >
        {showSender && !outbound && message.senderName && (
          <p className="text-xs font-semibold mb-0.5" style={{ color: senderColor(message.senderName) }}>
            {message.senderName}
          </p>
        )}
        {message.quoted && (
          <div className="mb-1.5 rounded-md border-s-4 border-emerald-500 bg-black/5 dark:bg-white/5 px-2 py-1 text-xs">
            {message.quoted.author && <p className="font-semibold text-emerald-700 dark:text-emerald-400" dir="ltr">{message.quoted.author}</p>}
            <p className="text-neutral-600 dark:text-neutral-300 line-clamp-2 whitespace-pre-wrap">{message.quoted.text}</p>
          </div>
        )}
        {deleted ? (
          <p className="italic text-neutral-400">🚫 ההודעה נמחקה</p>
        ) : isMedia ? (
          <>
            <MediaView message={message} />
            {caption && (
              <p className="mt-1 whitespace-pre-wrap">
                <Linkified text={caption} />
              </p>
            )}
          </>
        ) : (
          <p className="whitespace-pre-wrap">
            <Linkified text={message.body || `[${message.type}]`} />
          </p>
        )}
        {message.status === "failed" && message.error && <p className="text-xs text-red-500 mt-1">{message.error}</p>}
        <div className="flex items-center gap-1.5 justify-end mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
          {origin && <span>{origin}</span>}
          <span dir="ltr">{time}</span>
          <StatusMark message={message} />
        </div>
      </div>
    </div>
  );
}
