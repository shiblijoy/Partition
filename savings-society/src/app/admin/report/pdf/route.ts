import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { routeStaff } from "@/lib/admin-route";
import { getSettings } from "@/lib/settings";
import { isMonthKey, monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";
import { monthReport } from "../data";

/** FR-RPT-02: the monthly report as PDF. */
export async function GET(req: Request) {
  if (!(await routeStaff())) return new Response("Forbidden", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthKey(month)) return new Response("Bad month", { status: 400 });
  const [r, settings] = await Promise.all([monthReport(month), getSettings()]);
  const tk = (n: number) => `${n < 0 ? "- " : ""}Tk ${new Intl.NumberFormat("en-IN").format(Math.abs(Math.round(n)))}`;
  const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const line = (label: string, value = "", b = false) => {
    if (y < 60) { page = pdf.addPage([595, 842]); y = 790; }
    page.drawText(latin(label).slice(0, 80), { x: 50, y, size: 10, font: b ? bold : font });
    if (value) page.drawText(value, { x: 430, y, size: 10, font: b ? bold : font });
    y -= 17;
  };
  page.drawText(latin(`${settings.societyName} · ${monthLabel(month, "long")}`), { x: 50, y, size: 18, font: bold, color: rgb(0.06, 0.37, 0.29) });
  y -= 24;
  line(r.closedMonth ? `Final · closed ${fmtDate(r.closedMonth.closedAt)} by ${r.closedMonth.closedBy}` : "Draft · the month is not closed yet");
  y -= 6;
  line("Opening cash", tk(r.opening), true);
  line(`Deposits approved (${r.paidCount} of ${r.memberCount} members paid)`, tk(r.deposits));
  for (const i of r.income) line(`Income: ${i.description}${i.reversedAt ? " (reversed)" : ""}`, tk(i.amount));
  for (const e of r.expenses) line(`Expense: ${e.description}${e.reversedAt ? " (reversed)" : ""}`, tk(-e.amount));
  for (const i of r.started) line(`Invested: ${i.name}`, tk(-i.amount));
  for (const i of r.closed) line(`Returned: ${i.name}`, tk(i.returnedAmount));
  for (const w of r.payouts) line(`Payout: ${w.member.name}`, tk(-(w.payable ?? 0)));
  for (const x of r.reversals) line(`Reversal: ${x.note ?? ""}`, tk(x.amount));
  line("Closing cash", tk(r.closing), true);
  if (r.owing.length) { y -= 6; line(`Not paid: ${r.owing.map((m) => m.name).join(", ")}`); }
  return new Response(new Uint8Array(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="report-${month}.pdf"` } });
}
