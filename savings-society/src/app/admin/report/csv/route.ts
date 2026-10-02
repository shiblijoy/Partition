import { prisma } from "@/lib/prisma";
import { routeAdmin } from "@/lib/admin-route";
import { isMonthKey, monthLabel } from "@/lib/months";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { buildReport, memberStatement, monthReport, periodReport } from "../data";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csv(rows: Array<Array<string | number>>, filename: string): Response {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}

/** CSV versions of the reports, for Excel or Google Sheets. */
export async function GET(req: Request) {
  if (!(await routeAdmin())) return new Response("Forbidden", { status: 403 });

  const params = new URL(req.url).searchParams;
  const type = params.get("type") ?? "grid";

  if (type === "month") {
    const month = params.get("month") ?? "";
    if (!isMonthKey(month)) return new Response("Bad month", { status: 400 });
    const r = await monthReport(month);
    return csv(
      [
        ["Monthly report", monthLabel(month, "long"), r.closedMonth ? "Final" : "Draft"],
        [],
        ["Item", "Amount"],
        ["Opening cash", r.opening],
        ["Deposits approved", r.deposits],
        ...r.income.map((i) => [`Income: ${i.description}`, i.amount]),
        ...r.expenses.map((e) => [`Expense: ${e.description}`, -e.amount]),
        ...r.started.map((i) => [`Invested: ${i.name}`, -i.amount]),
        ...r.closed.map((i) => [`Returned: ${i.name}`, i.returnedAmount ?? 0]),
        ...r.payouts.map((w) => [`Payout: ${w.member.name}`, -(w.payable ?? 0)]),
        ["Closing cash", r.closing],
        [],
        ["Members paid", `${r.paidCount} of ${r.memberCount}`],
        ["Not paid", r.owing.map((m) => m.name).join("; ")],
      ],
      `report-${month}`
    );
  }

  if (type === "year") {
    const year = Number(params.get("year"));
    const r = await periodReport(new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59, 999));
    return csv(
      [
        ["Annual summary", year],
        [],
        ["Item", "Amount"],
        ["Cash on 1 Jan", r.opening],
        ["Deposits approved", r.deposits],
        ["Income and profit", r.incomeTotal],
        ["Investments returned", r.returned],
        ["Expenses", -r.expenseTotal],
        ["Newly invested", -r.invested],
        ["Paid to members who left", -r.payoutTotal],
        ["Cash at year end", r.closing],
      ],
      `annual-${year}`
    );
  }

  if (type === "member") {
    const id = params.get("member") ?? "";
    const { member, position } = await memberStatement(id);
    return csv(
      [
        ["Member statement", member.name, member.phone],
        [],
        ["Month", "Months covered", "Receipt", "Paid on", "Amount"],
        ...member.payments.map((p) => [monthLabel(p.forMonth), p.monthsCount, p.receiptNo ?? "", fmtDate(p.paidOn), p.amount]),
        [],
        ["Deposits", "", "", "", position.deposits],
        ["Withdrawn", "", "", "", -position.withdrawn],
        ["Profit share", "", "", "", Math.round(position.profitShare)],
        ["Cost share", "", "", "", -Math.round(position.costShare)],
        ["Net value", "", "", "", Math.round(position.net)],
      ],
      `statement-${member.name.replace(/\W+/g, "-").toLowerCase()}`
    );
  }

  if (type === "audit") {
    const month = params.get("month") ?? "";
    if (!isMonthKey(month)) return new Response("Bad month", { status: 400 });
    const [y, m] = month.split("-").map(Number);
    const entries = await prisma.auditLog.findMany({ where: { createdAt: { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) } }, orderBy: { createdAt: "asc" } });
    return csv([["When", "Action", "Detail"], ...entries.map((e) => [fmtDateTime(e.createdAt), e.action, e.detail])], `audit-${month}`);
  }

  const { months, members, fund } = await buildReport(120);
  const header = ["Member", "Phone", "Deposited", "Expected", "Due", "Paid ahead", "Cost share", "Profit share", ...months];
  const rows = members.map((m) => [
    m.name,
    m.phone,
    m.ledger.paid,
    m.ledger.expected,
    m.ledger.due,
    m.ledger.advance,
    Math.round(fund.expenseSharePerMember),
    Math.round(fund.profitSharePerMember),
    ...months.map((month) => m.ledger.statusFor(month)),
  ]);
  return csv([header, ...rows], `deposits-${new Date().toISOString().slice(0, 10)}`);
}
