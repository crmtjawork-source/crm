import { renderTemplate, type TemplateContext } from "./templates";
import type { DocSection } from "./types";

// Proposals and contracts a lead opens from a link and signs online.

export const SIGNER_FIELDS: { id: string; label: string; type: string }[] = [
  { id: "id_number", label: "תעודת זהות", type: "text" },
  { id: "email", label: "אימייל", type: "email" },
  { id: "phone", label: "טלפון", type: "tel" },
  { id: "address", label: "כתובת", type: "text" },
  { id: "company", label: "שם החברה / ח.פ.", type: "text" },
];

export const DOCUMENT_STATUS: Record<string, { label: string; tone: string }> = {
  sent: { label: "נשלח", tone: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
  viewed: { label: "נצפה", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  signed: { label: "נחתם", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  declined: { label: "נדחה", tone: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  void: { label: "בוטל", tone: "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 line-through" },
  expired: { label: "פג תוקף", tone: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800" },
};

export const documentUrl = (origin: string, token: string) => `${origin}/d/${token}`;

export function newSectionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Fills the lead's details into a template's text when a document is created.
export function renderSections(sections: DocSection[], ctx: TemplateContext): DocSection[] {
  const r = (s: string) => renderTemplate(s, ctx);
  return sections.map((s) => ({ id: s.id, title: r(s.title), subtitle: s.subtitle ? r(s.subtitle) : undefined, body: r(s.body) }));
}

// Light markup for section text, simple enough to type in a textarea:
//   blank line        → new paragraph
//   "- " / "• " line  → bullet
//   "1. " line        → numbered item
//   "## " line        → sub-heading
//   **bold**          → bold
export type Block =
  | { type: "p"; lines: string[] }
  | { type: "h"; text: string }
  | { type: "ul" | "ol"; items: string[] };

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", lines: para });
    para = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^\s*#{1,3}\s+(.*)$/);
    // A list continues only if nothing came between its items.
    const last = para.length ? null : blocks[blocks.length - 1];
    if (!line.trim()) flush();
    else if (heading) {
      flush();
      blocks.push({ type: "h", text: heading[1] });
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const text = (bullet ?? numbered)![1];
      if (last && last.type === kind) last.items.push(text);
      else blocks.push({ type: kind, items: [text] });
    } else para.push(line.trim());
  }
  flush();
  return blocks;
}

// "**x**" → [{bold:true, text:"x"}]
export function inlineParts(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} שנ'`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} דק'` : `${Math.floor(m / 60)} ש' ${m % 60} דק'`;
}
