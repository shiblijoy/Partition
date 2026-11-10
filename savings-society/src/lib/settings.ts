import { prisma } from "@/lib/prisma";
import { currentMonth } from "@/lib/months";
import { rateFor, sortRates, type Rate } from "@/lib/rates";

const DEFAULT_MONTHLY = 10000;

/**
 * Society-wide settings (a single row), created with defaults on first use,
 * plus the monthly deposit history. `monthlyAmount` is this month's amount.
 */
export async function getSettings() {
  const [row, rateRows] = await Promise.all([
    prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, startMonth: currentMonth() } }),
    prisma.monthlyRate.findMany({ orderBy: { fromMonth: "asc" } }),
  ]);
  let rates: Rate[] = rateRows.map((r) => ({ fromMonth: r.fromMonth, amount: r.amount }));
  if (rates.length === 0) {
    await prisma.monthlyRate.upsert({ where: { fromMonth: row.startMonth }, update: {}, create: { fromMonth: row.startMonth, amount: DEFAULT_MONTHLY } });
    rates = [{ fromMonth: row.startMonth, amount: DEFAULT_MONTHLY }];
  }
  rates = sortRates(rates);
  const now = currentMonth();
  return {
    ...row,
    rates,
    monthlyAmount: rateFor(now, rates),
    nextRate: rates.find((r) => r.fromMonth > now) ?? null,
  };
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;

/** "৳ 17,00,000" — taka amounts use lakh/crore grouping. */
export function money(amount: number, symbol: string): string {
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(amount)));
  return `${amount < 0 ? "− " : ""}${symbol} ${formatted}`; // non-breaking: "৳" never wraps away from the number
}

/** Whole taka from paisa, for display: shares are kept in paisa and rounded to the nearest taka (BR-10). */
export function paisaToTaka(paisa: number): number {
  return Math.round(paisa / 100);
}
