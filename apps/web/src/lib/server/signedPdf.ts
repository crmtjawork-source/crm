import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import { HEEBO_BASE64 } from "./heeboFont";
import { parseBody } from "../documents";

// Renders a signed document (cover, sections, signature block) as an A4 PDF
// with Hebrew right-to-left text.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const bidi = bidiFactory();

const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };

// Splits a logical line into runs in visual (left-to-right) order. The PDF font
// engine reverses any Hebrew run it is given, so Hebrew runs are handed over in
// logical order and everything else (digits, Latin) as is.
export function visualRuns(text: string): string[] {
  const embedding = bidi.getEmbeddingLevels(text, "rtl");
  const lv = Array.from(embedding.levels as Uint8Array);
  const items = Array.from(text).map((c, i) => ({ c: lv[i] % 2 === 1 ? (MIRROR[c] ?? c) : c, l: lv[i] }));
  // UAX #9 L2: from the highest level down to the lowest odd one, reverse every run at that level or above.
  const max = Math.max(0, ...lv);
  const minOdd = Math.min(...lv.filter((l) => l % 2 === 1), max + 1);
  for (let level = max; level >= minOdd; level--) {
    for (let i = 0; i < items.length; ) {
      if (items[i].l < level) {
        i++;
        continue;
      }
      let j = i;
      while (j < items.length && items[j].l >= level) j++;
      items.splice(i, j - i, ...items.slice(i, j).reverse());
      i = j;
    }
  }
  const runs: string[] = [];
  for (let i = 0; i < items.length; ) {
    const odd = items[i].l % 2 === 1;
    let j = i;
    while (j < items.length && items[j].l % 2 === 1 === odd) j++;
    const chars = items.slice(i, j).map((x) => x.c);
    runs.push((odd ? chars.reverse() : chars).join(""));
    i = j;
  }
  return runs;
}

const fieldLabels: Record<string, string> = { id_number: "תעודת זהות", email: "אימייל", phone: "טלפון", address: "כתובת", company: "שם החברה / ח.פ." };

export async function renderSignedPdf(doc: Row, company: { image?: string; name?: string; title?: string } | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font: PDFFont = await pdf.embedFont(Buffer.from(HEEBO_BASE64, "base64"), { subset: true });
  const W = 595.28,
    H = 841.89,
    M = 54,
    inkColor = rgb(0.1, 0.12, 0.15),
    muted = rgb(0.4, 0.43, 0.47);
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const clean = (t: string) => Array.from(t.replace(/\*\*/g, "")).filter((c) => (c.codePointAt(0) ?? 0) <= 0xffff && !/[​-‏‪-‮]/.test(c)).join("");
  const need = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const lines = (text: string, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && font.widthOfTextAtSize(next, size) > width) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  // Right-aligned paragraph (indent = space kept free on the right).
  const para = (text: string, size = 11, opts: { color?: ReturnType<typeof rgb>; indent?: number; gap?: number; center?: boolean } = {}) => {
    const width = W - 2 * M - (opts.indent ?? 0);
    for (const l of lines(text, size, width)) {
      need(size * 1.6);
      y -= size * 1.5;
      const runs = visualRuns(l);
      const w = runs.reduce((n, r) => n + font.widthOfTextAtSize(r, size), 0);
      let x = opts.center ? (W - w) / 2 : W - M - (opts.indent ?? 0) - w;
      for (const r of runs) {
        page.drawText(r, { x, y, size, font, color: opts.color ?? inkColor });
        x += font.widthOfTextAtSize(r, size);
      }
    }
    y -= opts.gap ?? 4;
  };

  // Cover
  const cover = (doc.cover ?? {}) as Row;
  y -= 40;
  para(cover.title || doc.title, 24, { center: true, gap: 8 });
  if (cover.prepared_for) para(`הוכן עבור: ${cover.prepared_for}`, 13, { center: true, color: muted });
  if (cover.date) para(String(cover.date), 11, { center: true, color: muted });
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.8, 0.82, 0.85) });
  y -= 10;

  // Sections
  for (const s of (doc.sections ?? []) as Row[]) {
    need(60);
    y -= 8;
    if (s.title) para(s.title, 15, { gap: 2 });
    if (s.subtitle) para(s.subtitle, 11, { color: muted, gap: 4 });
    for (const b of parseBody(String(s.body ?? ""))) {
      if (b.type === "h") para(b.text, 12.5, { gap: 2 });
      else if (b.type === "p") para(b.lines.join(" "), 11, { gap: 6 });
      else b.items.forEach((it, i) => para(`${b.type === "ol" ? `${i + 1}.` : "•"} ${it}`, 11, { indent: 8, gap: 2 }));
    }
  }

  // Signature block
  const sig = (doc.signature ?? {}) as Row;
  need(190);
  y -= 24;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.8, 0.82, 0.85) });
  y -= 6;
  para("חתימה", 14, { gap: 6 });
  const png = async (data?: string) => (data?.startsWith("data:image/png;base64,") ? pdf.embedPng(Buffer.from(data.split(",")[1], "base64")) : null);
  const clientImg = await png(sig.image).catch(() => null);
  if (clientImg) {
    const sc = Math.min(160 / clientImg.width, 70 / clientImg.height);
    need(70 * 1 + 20);
    y -= clientImg.height * sc;
    page.drawImage(clientImg, { x: W - M - clientImg.width * sc, y, width: clientImg.width * sc, height: clientImg.height * sc });
    y -= 6;
  }
  para(`שם החותם: ${sig.name ?? ""}`, 11);
  for (const [k, v] of Object.entries((sig.fields ?? {}) as Record<string, string>)) para(`${fieldLabels[k] ?? k}: ${v}`, 10.5, { color: muted, gap: 1 });
  if (doc.signed_at)
    para(
      `נחתם בתאריך: ${new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(new Date(doc.signed_at))}`,
      10.5,
      { color: muted, gap: 1 }
    );
  if (sig.ip) para(`כתובת IP: ${sig.ip}`, 9.5, { color: muted, gap: 1 });
  if (sig.content_hash) para(`SHA-256: ${sig.content_hash}`, 7.5, { color: muted, gap: 8 });

  const companyImg = await png(company?.image).catch(() => null);
  if (companyImg) {
    need(110);
    y -= 10;
    para(`חתימת החברה${company?.name ? ` — ${company.name}` : ""}${company?.title ? `, ${company.title}` : ""}`, 11, { gap: 4 });
    const sc = Math.min(160 / companyImg.width, 70 / companyImg.height);
    y -= companyImg.height * sc;
    page.drawImage(companyImg, { x: W - M - companyImg.width * sc, y, width: companyImg.width * sc, height: companyImg.height * sc });
  }
  return pdf.save();
}
