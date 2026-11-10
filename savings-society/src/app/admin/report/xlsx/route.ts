import ExcelJS from "exceljs";
import { routeStaff } from "@/lib/admin-route";
import { isMonthKey, monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";
import { monthReport } from "../data";

/** FR-RPT-02: the monthly report (collections, expenses, investments, balance) as an Excel file. */
export async function GET(req: Request) {
  if (!(await routeStaff())) return new Response("Forbidden", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthKey(month)) return new Response("Bad month", { status: 400 });
  const r = await monthReport(month);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(monthLabel(month, "long"));
  ws.columns = [{ header: "Item", key: "item", width: 52 }, { header: "Date", key: "date", width: 14 }, { header: "Amount (Tk)", key: "amount", width: 16 }];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ item: `Monthly report · ${monthLabel(month, "long")} · ${r.closedMonth ? "Final" : "Draft"}` });
  ws.addRow({ item: "Opening cash", amount: r.opening });
  ws.addRow({ item: `Deposits approved (${r.paidCount} of ${r.memberCount} members paid)`, amount: r.deposits });
  for (const i of r.income) ws.addRow({ item: `Income: ${i.description}${i.reversedAt ? " (reversed)" : ""}`, date: fmtDate(i.date), amount: i.amount });
  for (const e of r.expenses) ws.addRow({ item: `Expense: ${e.description}${e.reversedAt ? " (reversed)" : ""}`, date: fmtDate(e.date), amount: -e.amount });
  for (const i of r.started) ws.addRow({ item: `Invested: ${i.name}`, amount: -i.amount });
  for (const i of r.closed) ws.addRow({ item: `Returned: ${i.name}`, amount: i.returnedAmount });
  for (const w of r.payouts) ws.addRow({ item: `Payout: ${w.member.name}`, date: w.paidAt ? fmtDate(w.paidAt) : "", amount: -(w.payable ?? 0) });
  for (const x of r.reversals) ws.addRow({ item: `Reversal: ${x.note ?? ""}`, date: fmtDate(x.date), amount: x.amount });
  const last = ws.addRow({ item: "Closing cash", amount: r.closing });
  last.font = { bold: true };
  if (r.owing.length) ws.addRow({ item: `Not paid: ${r.owing.map((m) => m.name).join(", ")}` });
  if (r.closedMonth) for (const l of r.closedMonth.lines) ws.addRow({ item: `Reconciled: ${l.account} (books ${l.calculated})${l.note ? ` — ${l.note}` : ""}`, amount: l.actual });
  ws.getColumn("amount").numFmt = "#,##0";
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="report-${month}.xlsx"` },
  });
}
