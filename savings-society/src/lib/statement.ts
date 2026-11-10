import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { memberPosition } from "@/lib/society";
import { getSettings, paisaToTaka } from "@/lib/settings";
import { monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";

/** FR-RPT-03: one member's statement for a year. */
export async function yearStatement(memberId: string, year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  const [member, payments, costs, profits, position, payouts] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.payment.findMany({ where: { memberId, status: "APPROVED", forMonth: { gte: `${year}-01`, lte: `${year}-12` } }, include: { receipt: true }, orderBy: { forMonth: "asc" } }),
    prisma.allocation.aggregate({ where: { memberId, sourceType: "expense", date: { gte: start, lte: end } }, _sum: { paisa: true } }),
    prisma.allocation.aggregate({ where: { memberId, sourceType: { in: ["income", "gain"] }, date: { gte: start, lte: end } }, _sum: { paisa: true } }),
    memberPosition(memberId),
    prisma.withdrawal.findMany({ where: { memberId, status: "PAID", paidAt: { gte: start, lte: end } }, include: { receipt: true } }),
  ]);
  return {
    member,
    year,
    payments,
    payouts,
    deposits: payments.reduce((s, p) => s + p.amount, 0),
    costShare: paisaToTaka(-(costs._sum.paisa ?? 0)),
    profitShare: paisaToTaka(profits._sum.paisa ?? 0),
    position,
  };
}

export async function statementPdf(memberId: string, year: number): Promise<Uint8Array> {
  const s = await yearStatement(memberId, year);
  const settings = await getSettings();
  const tk = (n: number) => `Tk ${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const line = (label: string, value = "", b = false) => {
    if (y < 60) { page = pdf.addPage([595, 842]); y = 790; }
    page.drawText(label, { x: 50, y, size: 10, font: b ? bold : font });
    if (value) page.drawText(value, { x: 400, y, size: 10, font: b ? bold : font });
    y -= 18;
  };
  page.drawText(`${settings.societyName} · Statement ${year}`, { x: 50, y, size: 18, font: bold, color: rgb(0.06, 0.37, 0.29) });
  y -= 28;
  line(`${s.member.name}${s.member.memberNo != null ? ` · Member #${String(s.member.memberNo).padStart(2, "0")}` : ""} · ${s.member.phone}`);
  line(`Issued ${fmtDate(new Date())}`);
  y -= 10;
  line("Month", "Amount", true);
  for (const p of s.payments) line(`${monthLabel(p.forMonth, "long")} · receipt ${p.receipt?.receiptNo ?? "—"} · received ${p.receivedOn ? fmtDate(p.receivedOn) : "—"}`, tk(p.amount));
  if (s.payments.length === 0) line("No approved deposits this year.");
  y -= 8;
  line(`Deposits in ${year}`, tk(s.deposits), true);
  line(`Profit share in ${year}`, `+ ${tk(s.profitShare)}`);
  line(`Cost share in ${year}`, `- ${tk(s.costShare)}`);
  for (const w of s.payouts) line(`Paid out ${w.paidAt ? fmtDate(w.paidAt) : ""} (${w.receipt?.receiptNo ?? ""})`, `- ${tk(w.payable ?? 0)}`);
  y -= 8;
  line("All-time deposits", tk(s.position.deposits), true);
  line("Net value today (deposits + profit share - cost share - withdrawals)", tk(s.position.net), true);
  return pdf.save();
}
