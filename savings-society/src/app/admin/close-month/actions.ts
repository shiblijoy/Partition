"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { cashAsOf } from "@/lib/society";
import { isMonthKey, monthEnd, monthLabel } from "@/lib/months";
import { audit } from "@/lib/audit";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

/**
 * Closes a month once every account's real closing balance has been entered.
 * A difference must be explained: either recorded as a bank charge (when the
 * bank holds less than the books), or with a note. The month is then locked.
 */
export async function closeMonth(month: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  if (!isMonthKey(month)) return { error: "Unknown month." };
  if (await prisma.monthClose.findUnique({ where: { month } })) return { error: "Already closed." };

  const accounts = formData.getAll("account").map(String);
  const actuals = formData.getAll("actual").map((v) => Number(v));
  if (accounts.length === 0 || actuals.some((v) => !Number.isFinite(v))) return { error: "Enter every account's closing balance (0 if empty)." };
  const statements = formData.getAll("statement");
  const fix = String(formData.get("fix") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  const end = monthEnd(month);
  let appBalance = await cashAsOf(end);
  const actualTotal = actuals.reduce((s, v) => s + v, 0);
  const diff = Math.round((actualTotal - appBalance) * 100) / 100;

  if (diff !== 0) {
    if (fix === "charge" && diff < 0) {
      await prisma.expense.create({
        data: { date: end, category: "BANK_CHARGE", amount: -diff, description: `Bank charges found when closing ${monthLabel(month, "long")}`, createdById: admin.userId },
      });
      appBalance = await cashAsOf(end);
    } else if (!note) {
      return { error: `The accounts are ${money(Math.abs(diff), settings.currencySymbol)} ${diff < 0 ? "lower" : "higher"} than the books. Explain the difference before closing.` };
    }
  }

  const lines = [];
  for (let i = 0; i < accounts.length; i++) {
    const file = statements[i];
    let statementPath: string | null = null;
    if (file instanceof File && file.size > 0) {
      try {
        statementPath = await saveFile("statements/bank", file);
      } catch (err) {
        if (err instanceof UploadError) return { error: err.message };
        throw err;
      }
    }
    lines.push({ account: accounts[i], actual: actuals[i], statementPath });
  }

  await prisma.monthClose.create({ data: { month, appBalance, note, closedBy: admin.name, lines: { create: lines } } });
  await audit(admin.userId, "month.closed", `${admin.name} closed ${monthLabel(month, "long")}${note ? ` with a note: ${note}` : ""}`);
  revalidatePath("/admin", "layout");
  return { ok: `${monthLabel(month, "long")} is closed and locked. Corrections now go into the next month as new entries.` };
}
