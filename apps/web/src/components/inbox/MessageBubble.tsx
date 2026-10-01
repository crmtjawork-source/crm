import type { Message } from "@/lib/types";

const ORIGIN_LABELS: Record<NonNullable<Message["origin"]>, string> = {
  crm: "",
  automation: "אוטומציה",
  phone_app: "מהטלפון",
  history: "היסטוריה",
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

export function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  const origin = message.origin ? ORIGIN_LABELS[message.origin] : "";
  const time = new Date(message.createdAt).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          outbound
            ? "bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900"
            : "bg-neutral-100 dark:bg-neutral-900"
        } ${message.status === "failed" ? "border-red-300 dark:border-red-800" : ""}`}
      >
        <p>{message.body || `[${message.type}]`}</p>
        {message.status === "failed" && message.error && <p className="text-xs text-red-500 mt-1">{message.error}</p>}
        <div className="flex items-center gap-2 justify-end mt-1 text-[11px] text-neutral-400">
          {origin && <span>{origin}</span>}
          <span dir="ltr">{time}</span>
          <StatusMark message={message} />
        </div>
      </div>
    </div>
  );
}
