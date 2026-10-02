"use server";

import { revalidatePath } from "next/cache";
import { ExpenseCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { saveFile, deleteStoredFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

export async function addExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const category = String(formData.get("category") ?? "") as ExpenseCategory;
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "");
  const receipt = formData.get("receipt");

  if (!Object.values(ExpenseCategory).includes(category)) return { error: "Choose a category." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a positive number." };
  if (!description) return { error: "Describe what the money was spent on." };

  let receiptPath: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    try {
      receiptPath = await saveFile("receipts", receipt);
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message };
      throw err;
    }
  }

  await prisma.expense.create({
    data: {
      category,
      amount,
      description,
      date: dateRaw ? new Date(dateRaw) : new Date(),
      receiptPath,
      createdById: admin.userId,
    },
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
  return { ok: "Cost recorded." };
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await requireAdmin();
  const expense = await prisma.expense.delete({ where: { id: expenseId } });
  await deleteStoredFile(expense.receiptPath);
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}
