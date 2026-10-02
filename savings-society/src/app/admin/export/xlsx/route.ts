import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { routeAdmin } from "@/lib/admin-route";
import { audit } from "@/lib/audit";

/** Everything in the database as one workbook, one sheet per table, so the society can keep or move its records. */
export async function GET() {
  const admin = await routeAdmin();
  if (!admin) return new Response("Forbidden", { status: 403 });

  const [members, payments, expenses, income, investments, votes, withdrawals, fdrs, closes, notices, documents, audit_] = await Promise.all([
    prisma.user.findMany({ orderBy: { memberNo: "asc" } }),
    prisma.payment.findMany({ include: { member: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.expense.findMany({ orderBy: { date: "asc" } }),
    prisma.income.findMany({ orderBy: { date: "asc" } }),
    prisma.investment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.vote.findMany({ include: { member: { select: { name: true } }, investment: { select: { name: true } } } }),
    prisma.withdrawal.findMany({ include: { member: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.fdr.findMany(),
    prisma.monthClose.findMany({ include: { lines: true }, orderBy: { month: "asc" } }),
    prisma.notice.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.document.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Dreamhive";
  const sheet = (name: string, rows: Array<Record<string, unknown>>) => {
    const ws = wb.addWorksheet(name);
    const keys = rows.length ? Object.keys(rows[0]) : ["(empty)"];
    ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date || typeof v !== "object" || v === null ? v : JSON.stringify(v)])));
  };

  sheet("Members", members.map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== "passwordHash"))));
  sheet("Payments", payments.map(({ member, ...p }) => ({ memberName: member.name, ...p })));
  sheet("Expenses", expenses);
  sheet("Income", income);
  sheet("Investments", investments);
  sheet("Votes", votes.map((v) => ({ investment: v.investment.name, member: v.member.name, choice: v.choice, at: v.createdAt })));
  sheet("Withdrawals", withdrawals.map(({ member, ...w }) => ({ memberName: member.name, ...w })));
  sheet("FDRs", fdrs);
  sheet("Reconciliations", closes.flatMap(({ lines, ...c }) => (lines.length ? lines.map((l) => ({ ...c, account: l.account, actual: l.actual, statement: l.statementPath })) : [c])));
  sheet("Notices", notices);
  sheet("Documents", documents);
  sheet("Audit log", audit_);

  const buffer = await wb.xlsx.writeBuffer();
  await prisma.setting.update({ where: { id: 1 }, data: { lastExportAt: new Date() } });
  await audit(admin.id, "data.exported", `${admin.name} exported all data (Excel)`);
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dreamhive-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
