import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { STORAGE_ROOT } from "@/lib/uploads";
import { verifyUrl } from "@/lib/receipts";
import { takaInWords, fmtDate, fmtDateTime } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { pii } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { METHOD_LABELS } from "@/components/ui";

const tk = (n: number) => `Tk ${new Intl.NumberFormat("en-IN").format(Math.round(n))}`; // the standard PDF fonts have no ৳ glyph

/**
 * §6.4: the receipt PDF is made on the server (A5, society name, verify code and
 * QR code), stored once, and the same file is returned on every download.
 */
/** `showProfit`: the profit and land-gain lines of a payout are for admins and auditors only. */
export async function receiptPdf(receiptId: string, showProfit = false): Promise<Buffer> {
  const r = await prisma.receipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: { member: true, payment: { include: { account: true } }, withdrawal: true },
  });
  if (r.pdfPath && !r.cancelledAt) {
    try {
      return await readFile(path.join(STORAGE_ROOT, r.pdfPath));
    } catch {
      // file missing: make it again
    }
  }
  const settings = await getSettings();
  const member = pii(r.member);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${settings.societyName} receipt ${r.receiptNo}`);
  const page = pdf.addPage([420, 595]); // A5
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.06, 0.37, 0.29);
  const ink = rgb(0.08, 0.14, 0.11);
  const muted = rgb(0.36, 0.4, 0.38);

  page.drawRectangle({ x: 0, y: 515, width: 420, height: 80, color: green });
  page.drawText(settings.societyName, { x: 28, y: 560, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(r.kind === "DEPOSIT" ? "Official deposit receipt" : "Payout receipt", { x: 28, y: 540, size: 10, font, color: rgb(0.81, 0.9, 0.87) });
  page.drawText("Receipt no.", { x: 290, y: 562, size: 9, font, color: rgb(0.81, 0.9, 0.87) });
  page.drawText(r.receiptNo, { x: 290, y: 546, size: 12, font: bold, color: rgb(1, 1, 1) });

  let y = 485;
  page.drawText(r.kind === "DEPOSIT" ? "Amount received" : "Amount paid", { x: 28, y, size: 10, font, color: muted });
  page.drawText(tk(r.amount), { x: 28, y: y - 30, size: 28, font: bold, color: ink });
  page.drawText(takaInWords(r.amount), { x: 28, y: y - 48, size: 9, font, color: muted });
  y -= 80;

  const rows: Array<[string, string]> = [["Member", `${member.name}${member.memberNo != null ? ` · #${String(member.memberNo).padStart(2, "0")}` : ""}`]];
  if (r.payment) {
    const totalAfter = await prisma.payment.aggregate({ where: { memberId: r.memberId, status: "APPROVED", reviewedAt: { lte: r.payment.reviewedAt ?? r.issuedAt } }, _sum: { amount: true } });
    rows.push(
      ["For month", monthLabel(r.payment.forMonth, "long")],
      ["Method", METHOD_LABELS[r.payment.method]],
      ["Transaction ID", r.payment.reference ?? "—"],
      ["Date received", r.payment.receivedOn ? fmtDate(r.payment.receivedOn) : "—"],
      ["Account", r.payment.account?.name ?? "—"],
      ["Approved by", r.issuedBy ?? "Admin"],
      ["Total savings after this", tk(totalAfter._sum.amount ?? r.amount)]
    );
  }
  if (r.withdrawal) {
    const w = r.withdrawal;
    if (w.kind === "FULL" || w.kind === "NOMINEE") {
      rows.push(["Deposits", tk(w.deposits ?? 0)]);
      if (showProfit) rows.push(["+ Profit share", tk(w.profitShare ?? 0)]);
      rows.push(["- Cost share", tk(w.costShare ?? 0)]);
      if (showProfit && w.landTiming === "NOW") rows.push(["+ Land gain share", tk(w.landShare ?? 0)]);
    }
    rows.push(
      ["Paid to", w.kind === "NOMINEE" ? `${member.nomineeName ?? "Nominee"} (nominee)` : member.name],
      ["Sent to", w.payTo],
      ["Transaction ID", w.paidReference ?? "—"],
      ["Paid on", w.paidAt ? fmtDate(w.paidAt) : "—"],
      ["Paid by", w.paidBy ?? "Admin"]
    );
    if (w.landTiming === "ON_SALE" && (w.landShare ?? 0) > 0) rows.push(["Still owed (land share)", showProfit ? `${tk(w.landShare ?? 0)} when the land is sold` : "Paid when the land is sold"]);
  }
  for (const [k, v] of rows) {
    page.drawText(k, { x: 28, y, size: 9, font, color: muted });
    page.drawText(v.slice(0, 60), { x: 170, y, size: 10, font: bold, color: ink });
    y -= 20;
  }

  // QR code that opens the public verify page.
  const qr = QRCode.create(verifyUrl(r.verifyCode), { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const cell = 90 / size;
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++)
      if (qr.modules.get(row, col)) page.drawRectangle({ x: 28 + col * cell, y: 40 + (size - row - 1) * cell, width: cell, height: cell, color: ink });
  page.drawText("Verification code", { x: 135, y: 115, size: 9, font, color: muted });
  page.drawText(r.verifyCode, { x: 135, y: 96, size: 16, font: bold, color: ink });
  page.drawText("Scan the QR code or enter the code on the", { x: 135, y: 76, size: 8, font, color: muted });
  page.drawText("app's Check a receipt page to confirm it's genuine.", { x: 135, y: 65, size: 8, font, color: muted });
  page.drawText(`Issued ${fmtDateTime(r.issuedAt)}`, { x: 135, y: 46, size: 8, font, color: muted });

  if (r.cancelledAt) {
    page.drawText("CANCELLED", { x: 90, y: 300, size: 64, font: bold, color: rgb(0.61, 0.14, 0.09), opacity: 0.35, rotate: degrees(30) });
    page.drawText(`Cancelled ${fmtDate(r.cancelledAt)}: ${(r.cancelReason ?? "").slice(0, 60)}`, { x: 28, y: 20, size: 8, font, color: rgb(0.61, 0.14, 0.09) });
  }

  const bytes = Buffer.from(await pdf.save());
  if (!r.cancelledAt) {
    const rel = `receipt-pdfs/${r.receiptNo}.pdf`;
    await mkdir(path.join(STORAGE_ROOT, "receipt-pdfs"), { recursive: true });
    await writeFile(path.join(STORAGE_ROOT, rel), bytes);
    await prisma.receipt.update({ where: { id: r.id }, data: { pdfPath: rel } });
  }
  return bytes;
}
