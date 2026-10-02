import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { cashAsOf, fundSummary, membersWithLedgers, memberPosition } from "@/lib/society";
import { addMonths, currentMonth, monthEnd, monthKey, monthRange } from "@/lib/months";

/** Member × month grid, member accounts and cash flow (also used by the CSV export). */
export async function buildReport(monthsBack = 12) {
  const settings = await getSettings();
  const now = currentMonth();
  const from = addMonths(now, -(monthsBack - 1)) > settings.startMonth ? addMonths(now, -(monthsBack - 1)) : settings.startMonth;
  const months = monthRange(from, now);

  const [members, fund, payments, expenses] = await Promise.all([
    membersWithLedgers(settings),
    fundSummary(),
    prisma.payment.findMany({ where: { status: "APPROVED" }, select: { amount: true, paidOn: true } }),
    prisma.expense.findMany({ select: { amount: true, date: true } }),
  ]);

  const inflow = new Map<string, number>();
  for (const p of payments) inflow.set(monthKey(p.paidOn), (inflow.get(monthKey(p.paidOn)) ?? 0) + p.amount);
  const outflow = new Map<string, number>();
  for (const e of expenses) outflow.set(monthKey(e.date), (outflow.get(monthKey(e.date)) ?? 0) + e.amount);
  const cashFlow = months.map((m) => ({ month: m, collected: inflow.get(m) ?? 0, spent: outflow.get(m) ?? 0 }));

  return { settings, months, members, fund, cashFlow };
}

/** Money in and out during [start, end], with opening and closing cash. */
export async function periodReport(start: Date, end: Date) {
  const range = { gte: start, lte: end };
  const before = new Date(start.getTime() - 1);
  const [opening, closing, deposits, expenses, income, started, closed, payouts] = await Promise.all([
    cashAsOf(before),
    cashAsOf(end),
    prisma.payment.aggregate({ where: { status: "APPROVED", paidOn: range }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.findMany({ where: { date: range }, orderBy: { date: "asc" } }),
    prisma.income.findMany({ where: { date: range }, orderBy: { date: "asc" } }),
    prisma.investment.findMany({ where: { status: { in: ["ACTIVE", "CLOSED"] }, startedAt: range } }),
    prisma.investment.findMany({ where: { status: "CLOSED", closedAt: range } }),
    prisma.withdrawal.findMany({ where: { status: "PAID", paidAt: range }, include: { member: { select: { name: true } } } }),
  ]);
  return {
    opening,
    closing,
    deposits: deposits._sum.amount ?? 0,
    depositCount: deposits._count._all,
    expenses,
    expenseTotal: expenses.reduce((s, e) => s + e.amount, 0),
    income,
    incomeTotal: income.reduce((s, i) => s + i.amount, 0),
    invested: started.reduce((s, i) => s + i.amount, 0),
    started,
    returned: closed.reduce((s, i) => s + (i.returnedAmount ?? 0), 0),
    closed,
    payouts,
    payoutTotal: payouts.reduce((s, w) => s + (w.payable ?? 0), 0),
  };
}

export async function monthReport(month: string) {
  const [y, m] = month.split("-").map(Number);
  const settings = await getSettings();
  const [period, members, closedMonth] = await Promise.all([
    periodReport(new Date(y, m - 1, 1), monthEnd(month)),
    membersWithLedgers(settings),
    prisma.monthClose.findUnique({ where: { month } }),
  ]);
  const owing = members.filter((x) => x.ledger.statusFor(month) !== "paid" && x.ledger.statusFor(month) !== "before-join");
  const counted = members.filter((x) => x.ledger.statusFor(month) !== "before-join");
  return { ...period, paidCount: counted.length - owing.length, memberCount: counted.length, owing, closedMonth };
}

export async function memberStatement(memberId: string) {
  const [member, fund] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, include: { payments: { where: { status: "APPROVED" }, orderBy: { forMonth: "asc" } } } }),
    fundSummary(),
  ]);
  return { member, position: await memberPosition(memberId, fund), fund };
}
