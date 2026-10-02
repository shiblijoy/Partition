"use server";

import { revalidatePath } from "next/cache";
import { ExpenseCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { closedMonthError } from "@/lib/locks";
import { saveFile, deleteStoredFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

export async function addExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const category = String(formData.get("category") ?? "") as ExpenseCategory;
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "");
  const receipt = formData.get("receipt");
  const date = dateRaw ? new Date(dateRaw) : new Date();

  if (!Object.values(ExpenseCategory).includes(category)) return { error: "Choose a category." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a positive number." };
  if (!description) return { error: "Describe what the money was spent on." };
  const locked = await closedMonthError(date);
  if (locked) return { error: locked };

  let receiptPath: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    try {
      receiptPath = await saveFile("receipts", receipt);
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message };
      throw err;
    }
  }

  await prisma.expense.create({ data: { category, amount, description, date, receiptPath, createdById: admin.userId } });
  await audit(admin.userId, "expense.added", `${admin.name} recorded a ${money(amount, settings.currencySymbol)} expense: ${description}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
  return { ok: "Expense saved. Every member sees it in their app." };
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const admin = await requireAdmin();
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } });
  if (await closedMonthError(existing.date)) return; // locked: the page hides the button too
  const expense = await prisma.expense.delete({ where: { id: expenseId } });
  await deleteStoredFile(expense.receiptPath);
  await audit(admin.userId, "expense.deleted", `${admin.name} deleted the expense “${expense.description}” (${expense.amount})`);
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}
