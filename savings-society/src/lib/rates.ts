/**
 * Monthly deposit amounts over time. A change applies from a chosen month on;
 * earlier months keep the amount that was in force for them (BR-01, FR-SET-02).
 */
export type Rate = { fromMonth: string; amount: number };

/** Rates sorted oldest first. */
export function sortRates(rates: Rate[]): Rate[] {
  return [...rates].sort((a, b) => (a.fromMonth < b.fromMonth ? -1 : a.fromMonth > b.fromMonth ? 1 : 0));
}

/** The amount in force for a month: the latest rate starting on or before it (or the first rate, for older months). */
export function rateFor(month: string, rates: Rate[]): number {
  const sorted = sortRates(rates);
  if (sorted.length === 0) return 0;
  let amount = sorted[0].amount;
  for (const r of sorted) if (r.fromMonth <= month) amount = r.amount;
  return amount;
}

export function sumRates(months: string[], rates: Rate[]): number {
  return months.reduce((s, m) => s + rateFor(m, rates), 0);
}
