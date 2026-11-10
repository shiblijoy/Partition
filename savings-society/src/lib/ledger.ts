import { monthRange, currentMonth } from "@/lib/months";
import { rateFor, type Rate } from "@/lib/rates";

/**
 * How a member stands against the monthly deposit. Each month needs its own
 * approved payment (BR-02); a month is due when it has none (BR-04). The amount
 * owed for a month is the rate in force for that month (BR-01).
 */
export type MonthStatus = "paid" | "pending" | "due" | "upcoming" | "before-join";

export type Ledger = {
  firstMonth: string;
  monthsOwed: number; // months up to and including the current month
  monthsPaid: number; // of those, months with an approved payment
  expected: number;
  paid: number; // every approved deposit, including advance months
  due: number; // > 0 when behind
  advance: number; // approved deposits for future months
  behind: boolean;
  paidThrough: string | null; // last month of the unbroken paid run from the first month
  statusFor: (month: string) => MonthStatus;
};

export function firstMonthOf(member: { joinMonth: string }, startMonth: string): string {
  return member.joinMonth > startMonth ? member.joinMonth : startMonth;
}

export function memberLedger(
  member: { joinMonth: string },
  approved: Array<{ forMonth: string; amount: number }>,
  settings: { rates: Rate[]; startMonth: string },
  opts: { pending?: Iterable<string>; asOf?: string } = {}
): Ledger {
  const asOf = opts.asOf ?? currentMonth();
  const firstMonth = firstMonthOf(member, settings.startMonth);
  const owed = monthRange(firstMonth, asOf);
  const paidSet = new Set(approved.map((p) => p.forMonth));
  const pendingSet = new Set(opts.pending ?? []);
  const unpaid = owed.filter((m) => !paidSet.has(m));
  let paidThrough: string | null = null;
  for (const m of monthRange(firstMonth, `${Number(asOf.slice(0, 4)) + 5}${asOf.slice(4)}`)) {
    if (!paidSet.has(m)) break;
    paidThrough = m;
  }
  const due = unpaid.reduce((s, m) => s + rateFor(m, settings.rates), 0);

  return {
    firstMonth,
    monthsOwed: owed.length,
    monthsPaid: owed.length - unpaid.length,
    expected: owed.reduce((s, m) => s + rateFor(m, settings.rates), 0),
    paid: approved.reduce((s, p) => s + p.amount, 0),
    due,
    advance: approved.filter((p) => p.forMonth > asOf).reduce((s, p) => s + p.amount, 0),
    behind: unpaid.some((m) => m < asOf),
    paidThrough,
    statusFor(month) {
      if (month < firstMonth) return "before-join";
      if (paidSet.has(month)) return "paid";
      if (pendingSet.has(month)) return "pending";
      return month > asOf ? "upcoming" : "due";
    },
  };
}
