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
  const [members, fund, entries] = await Promise.all([
    membersWithLedgers(settings),
    fundSummary(),
    prisma.ledgerEntry.findMany({ where: { type: { in: ["DEPOSIT", "EXPENSE"] } }, select: { type: true, amount: true, date: true } }),
  ]);
  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  for (const e of entries) {
    const m = monthKey(e.date);
    if (e.type === "DEPOSIT") inflow.set(m, (inflow.get(m) ?? 0) + e.amount);
    else outflow.set(m, (outflow.get(m) ?? 0) - e.amount);
  }
  const cashFlow = months.map((m) => ({ month: m, collected: inflow.get(m) ?? 0, spent: outflow.get(m) ?? 0 }));
  return { settings, months, members, fund, cashFlow };
}

/** Money in and out during [start, end] from the ledger, with opening and closing cash. */
export async function periodReport(start: Date, end: Date) {
  const range = { gte: start, lte: end };
  const before = new Date(start.getTime() - 1);
  const [opening, closing, byType, expenses, income, started, closed, payouts, reversals] = await Promise.all([
    cashAsOf(before),
    cashAsOf(end),
    prisma.ledgerEntry.groupBy({ by: ["type"], where: { date: range }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.findMany({ where: { date: range }, orderBy: { date: "asc" } }),
    prisma.income.findMany({ where: { date: range }, orderBy: { date: "asc" } }),
    prisma.ledgerEntry.findMany({ where: { type: "INVEST_OUT", date: range, reversesId: null } }),
    prisma.ledgerEntry.findMany({ where: { type: "CAPITAL_BACK", date: range, reversesId: null } }),
    prisma.withdrawal.findMany({ where: { status: "PAID", paidAt: range }, include: { member: { select: { name: true } } } }),
    prisma.ledgerEntry.findMany({ where: { reversesId: { not: null }, date: range } }),
  ]);
  const sum = (t: string) => byType.find((r) => r.type === t)?._sum.amount ?? 0;
  const invNames = new Map((await prisma.investment.findMany({ where: { id: { in: [...started, ...closed].map((e) => e.sourceId) } }, select: { id: true, name: true, amount: true, returnedAmount: true } })).map((i) => [i.id, i]));
  return {
    opening,
    closing,
    deposits: sum("DEPOSIT"),
    depositCount: byType.find((r) => r.type === "DEPOSIT")?._count._all ?? 0,
    expenses,
    expenseTotal: -sum("EXPENSE"),
    income,
    incomeTotal: sum("INCOME"),
    invested: -sum("INVEST_OUT"),
    started: started.map((e) => ({ id: e.sourceId, name: invNames.get(e.sourceId)?.name ?? e.note ?? "Investment", amount: -e.amount })),
    returned: sum("CAPITAL_BACK"),
    closed: closed.map((e) => ({ id: e.sourceId, name: invNames.get(e.sourceId)?.name ?? e.note ?? "Investment", returnedAmount: e.amount })),
    payouts,
    payoutTotal: -sum("PAYOUT"),
    transfers: sum("TRANSFER"),
    reversals,
  };
}

export async function monthReport(month: string) {
  const [y, m] = month.split("-").map(Number);
  const settings = await getSettings();
  const [period, members, closedMonth] = await Promise.all([
    periodReport(new Date(y, m - 1, 1), monthEnd(month)),
    membersWithLedgers(settings),
    prisma.monthClose.findUnique({ where: { month }, include: { lines: true } }),
  ]);
  const counted = members.filter((x) => x.ledger.statusFor(month) !== "before-join");
  const owing = counted.filter((x) => x.ledger.statusFor(month) !== "paid");
  return { ...period, paidCount: counted.length - owing.length, memberCount: counted.length, owing, closedMonth };
}

export async function memberStatement(memberId: string) {
  const [member, fund] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, include: { payments: { where: { status: "APPROVED" }, include: { receipt: true }, orderBy: { forMonth: "asc" } } } }),
    fundSummary(),
  ]);
  return { member, position: await memberPosition(memberId, fund), fund };
}
