// What an agent can report after a call. `status` is what the call log
// stores (the same words providers use), `outcome` keeps the finer answer.
export type CallOutcome = "answered" | "callback" | "no_answer" | "voicemail" | "busy" | "wrong_number";

export const CALL_OUTCOMES: { id: CallOutcome; label: string; status: "answered" | "no_answer" | "busy" | "failed" }[] = [
  { id: "answered", label: "דיברנו", status: "answered" },
  { id: "callback", label: "ביקש שאחזור", status: "answered" },
  { id: "no_answer", label: "לא ענה", status: "no_answer" },
  { id: "voicemail", label: "משיבון", status: "no_answer" },
  { id: "busy", label: "תפוס", status: "busy" },
  { id: "wrong_number", label: "מספר שגוי", status: "failed" },
];

export const CALL_STATUS_LABEL: Record<string, string> = {
  initiated: "ממתינה לתיעוד",
  answered: "נענתה",
  no_answer: "לא נענתה",
  busy: "תפוס",
  cancelled: "בוטלה",
  failed: "לא מחובר",
};

export const outcomeLabel = (outcome?: string | null) => CALL_OUTCOMES.find((o) => o.id === outcome)?.label;

// The CRM tells itself a call was logged/finished (timeline and lists reload).
export const CALLS_CHANGED = "crm:calls-changed";
export const announceCallsChanged = () => window.dispatchEvent(new Event(CALLS_CHANGED));

export const dialHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
