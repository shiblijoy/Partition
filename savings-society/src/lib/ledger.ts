import { addMonths, monthDiff, monthRange, currentMonth } from "@/lib/months";

/**
 * How a member stands against the monthly deposit.
 *
 * Approved payments are pooled and applied to months oldest-first, starting from
 * the later of the society's start month and the member's join month. So a
 * double payment simply covers the next month too, and a short payment shows
 * that month as "partial" — members never have to split a transfer per month.
 */
export type MonthStatus = "paid" | "partial" | "due" | "upcoming" | "before-join";

export type Ledger = {
  firstMonth: string;
  monthsOwed: number; // months up to and including the current month
  expected: number;
  paid: number;
  due: number; // > 0 when behind
  advance: number; // > 0 when paid ahead
  paidThrough: string | null; // last fully covered month
  statusFor: (month: string) => MonthStatus;
};

export function memberLedger(
  member: { joinMonth: string },
  approvedTotal: number,
  settings: { monthlyAmount: number; startMonth: string },
  asOf: string = currentMonth()
): Ledger {
  const monthly = settings.monthlyAmount;
  const firstMonth = member.joinMonth > settings.startMonth ? member.joinMonth : settings.startMonth;
  const monthsOwed = monthRange(firstMonth, asOf).length;
  const expected = monthsOwed * monthly;
  const fullMonths = monthly > 0 ? Math.floor(approvedTotal / monthly + 1e-9) : 0;

  return {
    firstMonth,
    monthsOwed,
    expected,
    paid: approvedTotal,
    due: Math.max(expected - approvedTotal, 0),
    advance: Math.max(approvedTotal - expected, 0),
    paidThrough: fullMonths > 0 ? addMonths(firstMonth, fullMonths - 1) : null,
    statusFor(month) {
      const idx = monthDiff(firstMonth, month);
      if (idx < 0) return "before-join";
      if (approvedTotal >= (idx + 1) * monthly - 1e-9) return "paid";
      if (approvedTotal > idx * monthly + 1e-9) return "partial";
      return month > asOf ? "upcoming" : "due";
    },
  };
}

