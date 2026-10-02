import { prisma } from "@/lib/prisma";
import { monthKey, monthLabel } from "@/lib/months";

/**
 * Once a month is closed its books are locked: nothing dated in it can be added
 * or deleted. Corrections go into the current month as new entries instead.
 * Returns an error message, or null if the date is in an open month.
 */
export async function closedMonthError(date: Date): Promise<string | null> {
  const month = monthKey(date);
  const closed = await prisma.monthClose.findUnique({ where: { month } });
  return closed ? `${monthLabel(month, "long")} is closed. Date the entry in an open month (corrections go in as new entries).` : null;
}
