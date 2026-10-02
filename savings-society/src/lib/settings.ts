import { prisma } from "@/lib/prisma";
import { currentMonth } from "@/lib/months";

/** Society-wide settings (a single row), created with defaults on first use. */
export async function getSettings() {
  return prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, startMonth: currentMonth() },
  });
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;

/** "৳ 17,00,000" — taka amounts use lakh/crore grouping. */
export function money(amount: number, symbol: string): string {
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(amount)));
  return `${amount < 0 ? "−\u00a0" : ""}${symbol}\u00a0${formatted}`; // non-breaking: "৳" never wraps away from the number
}
