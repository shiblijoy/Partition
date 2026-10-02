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

export function money(amount: number, symbol: string): string {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.abs(amount));
  return `${amount < 0 ? "-" : ""}${symbol}${formatted}`;
}
