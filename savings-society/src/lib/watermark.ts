import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/** The standard PDF fonts only cover Latin-1, so anything else (e.g. Bangla) is dropped from the stamp. */
const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "").replace(/\s+/g, " ").trim();

/**
 * FR-DOC-08: a downloaded copy carries the society's name, the member's name
 * and the date across every page. Images become a one-page PDF with the stamp.
 */
export async function watermark(bytes: Buffer, contentType: string, stamp: string): Promise<Uint8Array> {
  let pdf: PDFDocument;
  if (contentType === "application/pdf") {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } else {
    pdf = await PDFDocument.create();
    const img = contentType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
    const page = pdf.addPage([img.width * scale, img.height * scale]);
    page.drawImage(img, { x: 0, y: 0, width: img.width * scale, height: img.height * scale });
  }
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = latin(stamp) || "Dreamhive";
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(10, Math.min(width, height) / 28);
    for (let i = 0; i < 3; i++) {
      page.drawText(text, { x: width * 0.08, y: height * (0.2 + i * 0.3), size, font, color: rgb(0.06, 0.37, 0.29), opacity: 0.18, rotate: degrees(25) });
    }
    page.drawText(text, { x: 12, y: 10, size: 8, font, color: rgb(0.3, 0.3, 0.3), opacity: 0.8 });
  }
  return pdf.save();
}
