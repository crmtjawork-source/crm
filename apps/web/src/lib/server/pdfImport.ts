import "server-only";
import { extractTextLines, linesToSections, type PdfLine } from "@/lib/pdfLayout";
import type { DocSection } from "@/lib/types";

// Turns an uploaded PDF (a contract, a proposal) into editable document
// sections. Headings are recognised by font size, bullets by their marks.
export async function pdfToSections(data: Uint8Array): Promise<{ title: string; sections: DocSection[]; pages: number }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const lines: PdfLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    // Loads the page's fonts, so their real names (…-Bold) are known.
    await page.getOperatorList();
    const content = await page.getTextContent();
    const fontName = (id: string): string => {
      try {
        return (page.commonObjs.get(id) as { name?: string })?.name ?? "";
      } catch {
        return "";
      }
    };
    lines.push(...extractTextLines(content.items as never[], p, fontName));
  }
  const result = linesToSections(lines);
  return { ...result, pages: pdf.numPages };
}
