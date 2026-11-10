"use server";

import { ExpenseCategory } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { attempt, changed, dateField, text } from "@/lib/actions";
import { addExpense as add, reverseExpense } from "@/lib/services/books";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

export async function addExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const category = String(formData.get("category") ?? "") as ExpenseCategory;
    if (!Object.values(ExpenseCategory).includes(category)) return { error: "Choose a category." };
    let receiptPath: string | null = null;
    const receipt = formData.get("receipt");
    if (receipt instanceof File && receipt.size > 0) {
      try {
        receiptPath = await saveFile("receipts", receipt);
      } catch (err) {
        if (err instanceof UploadError) return { error: err.message };
        throw err;
      }
    }
    await add(await getSettings(), {
      date: dateField(formData, "date"),
      category,
      amount: Number(formData.get("amount")),
      description: text(formData, "description") ?? "",
      receiptPath,
      accountId: text(formData, "accountId"),
      actor: { id: admin.userId, name: admin.name },
    });
    changed();
    return { ok: "Expense saved and shared across the members. Every member sees it in their app." };
  });
}

export async function reverse(expenseId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await reverseExpense(await getSettings(), expenseId, text(formData, "reason") ?? "", { id: admin.userId, name: admin.name });
    changed();
    return { ok: "Reversed." };
  });
}
