import { prisma } from "@/lib/prisma";
import { accountBalances, cashAt } from "@/lib/books";
import { audit } from "@/lib/audit";
import { ServiceError } from "@/lib/errors";
import { currentMonth, monthEnd, monthLabel } from "@/lib/months";
import { money, type Settings } from "@/lib/settings";
import { addExpenseIn, addIncomeIn } from "@/lib/services/books";
import { inTx, type Actor } from "@/lib/services/payments";

/** The accounts that existed at a month's end, with the balance the books calculate for each. */
export async function calculatedBalances(month: string) {
  const end = monthEnd(month);
  const rows = await accountBalances(prisma, end);
  // Accounts open at the month's end. When an account was added to the app doesn't matter (its
  // opening balance covers the time before); FDRs count from the day they were opened.
  return rows.filter((a) => (!a.openedOn || a.openedOn <= end) && (!a.closedOn || a.closedOn > end) && (a.active || a.closedOn));
}

export type ReconInput = { accountId: string; actual: number; note: string | null; fix: "none" | "charge" | "interest"; statementPath: string | null };

/**
 * FR-REC-02..04 / UC-10: every account's real closing balance is entered; a
 * difference must be explained by a note, or by a correcting entry (a bank
 * charge when the bank holds less, bank interest when it holds more). The
 * month is then closed and locked.
 */
export async function closeMonth(settings: Settings, month: string, lines: ReconInput[], actor: Actor) {
  if (month >= currentMonth()) throw new ServiceError("A month can be closed once it has ended.");
  return inTx(async (tx) => {
    if (await tx.monthClose.findUnique({ where: { month } })) throw new ServiceError("Already closed.");
    const end = monthEnd(month);
    const out = [];
    for (const l of lines) {
      if (!Number.isFinite(l.actual)) throw new ServiceError("Enter every account's closing balance (0 if empty).");
      const account = await tx.account.findUniqueOrThrow({ where: { id: l.accountId } });
      const actual = Math.round(l.actual);
      let calculated = await cashAt(tx, end, account.id);
      const diff = actual - calculated;
      if (diff !== 0) {
        if (l.fix === "charge" && diff < 0) {
          await addExpenseIn(tx, settings, { date: end, category: "BANK_CHARGE", amount: -diff, description: `Bank charges found when closing ${monthLabel(month, "long")} (${account.name})`, receiptPath: l.statementPath, accountId: account.id, actor });
        } else if (l.fix === "interest" && diff > 0) {
          await addIncomeIn(tx, settings, { date: end, kind: "BANK_INTEREST", amount: diff, description: `Interest found when closing ${monthLabel(month, "long")} (${account.name})`, filePath: l.statementPath, accountId: account.id, actor });
        } else if (!l.note?.trim()) {
          throw new ServiceError(`${account.name} is ${money(Math.abs(diff), settings.currencySymbol)} ${diff < 0 ? "lower" : "higher"} than the books. Explain the difference before closing.`);
        }
        calculated = await cashAt(tx, end, account.id);
      }
      out.push({ account: account.name, accountId: account.id, calculated, actual, note: l.note?.trim() || null, statementPath: l.statementPath });
    }
    const appBalance = out.reduce((s, l) => s + l.calculated, 0);
    const note = out.filter((l) => l.note).map((l) => `${l.account}: ${l.note}`).join(" · ") || null;
    await tx.monthClose.create({ data: { month, appBalance, note, closedBy: actor.name, lines: { create: out } } });
    await audit(actor.id, "month.closed", `${actor.name} closed ${monthLabel(month, "long")}${note ? ` with notes: ${note}` : ""}`, { db: tx, entity: `month:${month}`, after: out });
  });
}
