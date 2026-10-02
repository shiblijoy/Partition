import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { fundSummary, membersWithLedgers } from "@/lib/society";
import { addMonths, currentMonth, monthKey, monthRange } from "@/lib/months";

/** Everything the report page and its CSV export need, computed once. */
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

  // Cash flow by calendar month (when money actually came in / went out).
  const inflow = new Map<string, number>();
  for (const p of payments) inflow.set(monthKey(p.paidOn), (inflow.get(monthKey(p.paidOn)) ?? 0) + p.amount);
  const outflow = new Map<string, number>();
  for (const e of expenses) outflow.set(monthKey(e.date), (outflow.get(monthKey(e.date)) ?? 0) + e.amount);

  let running = 0;
  for (const p of payments) if (monthKey(p.paidOn) < from) running += p.amount;
  for (const e of expenses) if (monthKey(e.date) < from) running -= e.amount;
  const cashFlow = months.map((m) => {
    const inAmt = inflow.get(m) ?? 0;
    const outAmt = outflow.get(m) ?? 0;
    running += inAmt - outAmt;
    return { month: m, collected: inAmt, spent: outAmt, balance: running };
  });

  return { settings, months, members, fund, cashFlow };
}
