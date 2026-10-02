/** Months are stored as "YYYY-MM" strings so they sort and compare as plain strings. */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return monthKey(new Date());
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

/** Number of months from `from` to `to`, e.g. 2026-01 → 2026-03 is 2. Negative if `to` is earlier. */
export function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Inclusive list of month keys from `from` to `to`. Empty if `to` is before `from`. */
export function monthRange(from: string, to: string): string[] {
  const count = monthDiff(from, to) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => addMonths(from, i));
}

export function monthLabel(key: string, style: "short" | "long" = "short"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: style === "short" ? "short" : "long",
    year: "numeric",
  });
}
