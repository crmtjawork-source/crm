import type { DocSection } from "./types";

// Pure layout logic for PDF import (kept free of the PDF engine so it can be
// tested on its own). Coordinates are PDF points, y grows upwards.

type Item = { str: string; transform: number[]; width: number; height: number; fontName: string; hasEOL?: boolean };

export type PdfLine = { page: number; y: number; x: number; size: number; bold: boolean; text: string };

const HEB = /[֐-׿]/;

export function extractTextLines(items: Item[], page: number, fontName: (id: string) => string): PdfLine[] {
  const runs = items
    .filter((it) => typeof it.str === "string" && it.str.length > 0)
    .map((it) => ({
      text: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      size: Math.abs(it.transform[3]) || Math.hypot(it.transform[2], it.transform[3]) || it.height,
      bold: /bold|black|heavy|semibold|demi/i.test(fontName(it.fontName)),
    }))
    .filter((r) => r.text.trim() || r.w > 0);

  // Group runs into rows by baseline.
  runs.sort((a, b) => b.y - a.y);
  const rows: (typeof runs)[] = [];
  for (const r of runs) {
    const row = rows.find((rw) => Math.abs(rw[0].y - r.y) < Math.max(2, r.size * 0.35));
    if (row) row.push(r);
    else rows.push([r]);
  }

  const out: PdfLine[] = [];
  for (const row of rows) {
    const rtl = row.filter((r) => HEB.test(r.text)).reduce((n, r) => n + r.text.length, 0) >= row.reduce((n, r) => n + r.text.replace(/\s/g, "").length, 0) / 3;
    row.sort((a, b) => (rtl ? b.x + b.w - (a.x + a.w) : a.x - b.x));
    // A wide gap means separate columns (e.g. a title beside its text).
    const segments: (typeof row)[] = [];
    for (const r of row) {
      const seg = segments[segments.length - 1];
      const prev = seg?.[seg.length - 1];
      const gap = prev ? (rtl ? prev.x - (r.x + r.w) : r.x - (prev.x + prev.w)) : 0;
      const sizeJump = prev && Math.max(prev.size, r.size) / Math.min(prev.size, r.size) > 1.15;
      if (!prev || sizeJump || gap > Math.min(prev.size, r.size) * 1.8) segments.push([r]);
      else seg.push(r);
    }
    for (const seg of segments) {
      let text = "";
      for (let i = 0; i < seg.length; i++) {
        const r = seg[i];
        const prev = seg[i - 1];
        if (prev) {
          const gap = rtl ? prev.x - (r.x + r.w) : r.x - (prev.x + prev.w);
          if (gap > r.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(r.text)) text += " ";
        }
        text += r.text;
      }
      text = text.replace(/\s+/g, " ").trim();
      // RTL lines ending in a number: the final period lands before the number.
      if (rtl) text = text.replace(/(^|\s)([.,:;!?])(\d[\d\-/.,]*\d)$/, "$1$3$2");
      if (!text) continue;
      const chars = seg.reduce((n, r) => n + r.text.length, 0);
      out.push({
        page,
        y: seg[0].y,
        x: Math.max(...seg.map((r) => r.x + r.w)),
        size: Math.max(...seg.map((r) => r.size)),
        bold: seg.filter((r) => r.bold).reduce((n, r) => n + r.text.length, 0) > chars / 2,
        text,
      });
    }
  }
  return out;
}

// Includes the private-use glyphs Word uses for Symbol / Wingdings bullets.
const BULLET = /^[•●▪◦·○■□►▸➢✓✔\-–—*\uF0B7\uF0A7\uF076\uF0D8\uF0FC\uF0A8]\s*/;
const PAGE_NO = /^(\d+|\d+\s*(\/|מתוך|of)\s*\d+|עמוד\s*\d+.*|page\s*\d+.*)$/i;

export function linesToSections(lines: PdfLine[]): { title: string; sections: DocSection[] } {
  // Drop page numbers and lines repeated on most pages (headers / footers).
  const pages = new Set(lines.map((l) => l.page)).size;
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.text, (counts.get(l.text) ?? 0) + 1);
  const body = lines.filter((l) => !PAGE_NO.test(l.text) && !(pages > 2 && (counts.get(l.text) ?? 0) >= Math.ceil(pages * 0.6)));
  if (!body.length) return { title: "", sections: [] };

  // The most common size (by characters) is body text.
  const bySize = new Map<number, number>();
  for (const l of body) bySize.set(Math.round(l.size), (bySize.get(Math.round(l.size)) ?? 0) + l.text.length);
  const base = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // The document's own line spacing: the usual distance between two body lines.
  const gaps: number[] = [];
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1];
    const b = body[i];
    if (a.page === b.page && Math.round(a.size) === base && Math.round(b.size) === base && a.y - b.y > 0 && a.y - b.y < base * 3) gaps.push(a.y - b.y);
  }
  gaps.sort((a, b) => a - b);
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length * 0.3)] : base * 1.3;
  const isHeading = (l: PdfLine) => l.size >= base * 1.2 && l.text.length <= 90 && !/^[\d\s/.\-:]+$/.test(l.text) && !/@/.test(l.text);
  const isSub = (l: PdfLine) => !isHeading(l) && l.text.length <= 70 && (l.size >= base * 1.08 || (l.bold && !/[.,;:]$/.test(l.text)));

  // Body text's right edge (RTL) — lines well to its right sit in a side
  // column next to the text, like a section's heading and subtitle.
  const edges = new Map<number, number>();
  for (const l of body) if (Math.round(l.size) === base) edges.set(Math.round(l.x / 5) * 5, (edges.get(Math.round(l.x / 5) * 5) ?? 0) + 1);
  const bodyRight = [...edges.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const inSideColumn = (l: PdfLine) => l.x > bodyRight + base * 3;

  // A heading wrapped onto two lines in a side column is one heading, even
  // when body lines from the next column come between them.
  for (let i = 0; i < body.length; i++) {
    const h = body[i];
    if (!isHeading(h)) continue;
    for (let j = i + 1; j < body.length && body[j].page === h.page && h.y - body[j].y < h.size * 1.9; j++) {
      const n = body[j];
      if (isHeading(n) && Math.abs(n.size - h.size) < 0.5 && Math.abs(n.x - h.x) < h.size) {
        h.text += ` ${n.text}`;
        h.y = n.y;
        body.splice(j, 1);
        j--;
      }
    }
  }

  // A very large first line on page 1 is the document's title.
  let title = "";
  const first = body[0];
  const maxSize = Math.max(...body.map((l) => l.size));
  let start = 0;
  if (first.page === 1 && first.size >= maxSize * 0.95 && isHeading(first)) {
    title = first.text;
    start = 1;
    while (body[start] && body[start].page === 1 && Math.abs(body[start].size - first.size) < 0.5 && Math.abs(body[start].y - body[start - 1].y) < first.size * 1.6) {
      title += ` ${body[start].text}`;
      start++;
    }
  }

  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  let buf: string[] = [];
  let prev: PdfLine | null = null;
  const flush = () => {
    if (!current) current = { id: `s${sections.length + 1}`, title: "", body: "" };
    current.body = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    delete (current as { _x?: number })._x;
    if (current.title || current.body) sections.push(current);
    buf = [];
  };

  for (const l of body.slice(start)) {
    if (isHeading(l)) {
      // Consecutive heading lines are one wrapped heading.
      if (prev && isHeading(prev) && buf.length === 0 && current && l.page === prev.page && prev.y - l.y < l.size * 1.8) {
        current.title += ` ${l.text}`;
      } else {
        if (current || buf.length) flush();
        current = { id: `s${sections.length + 1}`, title: l.text, body: "" };
        (current as { _x?: number })._x = l.x;
      }
      prev = l;
      continue;
    }
    // Small text beside the heading (side column) is the section's subtitle.
    if (current && inSideColumn(l) && !isSub(l) && l.text.length <= 80 && Math.abs(l.x - (current as { _x?: number })._x!) < base * 2) {
      current.subtitle = current.subtitle ? `${current.subtitle} ${l.text}` : l.text;
      continue;
    }
    const gap = prev && prev.page === l.page ? prev.y - l.y : 0;
    const paraBreak = prev && prev.page === l.page && gap > lineGap * 1.3;
    const bullet = BULLET.test(l.text) && l.text.replace(BULLET, "").length > 0;
    const numbered = /^\(?\d{1,2}[.)]\s/.test(l.text);
    let text = l.text;
    if (bullet) text = `- ${l.text.replace(BULLET, "")}`;
    else if (isSub(l)) text = `## ${l.text}`;
    else if (l.bold && !numbered) text = `**${l.text}**`;

    const last = buf.length ? buf[buf.length - 1] : "";
    // A wrapped line continues the previous paragraph / bullet.
    const continues =
      last && !paraBreak && !bullet && !numbered && !text.startsWith("## ") && !last.startsWith("## ") && last !== "" && !/[.:!?]$/.test(last.replace(/\*+$/, ""));
    if (paraBreak && last !== "") buf.push("");
    if (continues) buf[buf.length - 1] = `${last} ${text}`.replace(/\*\* \*\*/g, " ");
    else buf.push(text);
    prev = l;
  }
  flush();

  // Cover leftovers before the real content (client name, date, sender) and
  // the PDF's own signature block — the system adds both itself.
  const firstReal = sections.findIndex((x) => x.body.length > 60);
  const coverOnly = (x: DocSection) => [x.title, ...x.body.split("\n")].every((line) => line.trim().length < 35);
  const cleaned = sections
    .filter((x, i) => i >= firstReal || !coverOnly(x))
    .map((x) => (x.title ? x : { ...x, title: "פתיח" }))
    .filter((x) => !(/^(חתימה|חתימות|חתימת הצדדים|signature|signatures)$/i.test(x.title.trim()) && x.body.length < 200));
  return { title, sections: cleaned.length ? cleaned.map((x, i) => ({ ...x, id: `s${i + 1}` })) : sections };
}
