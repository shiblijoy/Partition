"use server";

import { revalidatePath } from "next/cache";
import { IncomeKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { closedMonthError } from "@/lib/locks";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}

export async function addIncome(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const kind = String(formData.get("kind") ?? "") as IncomeKind;
  const amount = Number(formData.get("amount"));
  const dateRaw = String(formData.get("date") ?? "");
  const account = String(formData.get("account") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  const file = formData.get("file");
  const date = dateRaw ? new Date(dateRaw) : new Date();

  if (!Object.values(IncomeKind).includes(kind)) return { error: "Choose the type." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount." };
  if (!description) return { error: "Add a short description." };
  const locked = await closedMonthError(date);
  if (locked) return { error: locked };

  let filePath: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      filePath = await saveFile("statements/income", file);
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message };
      throw err;
    }
  }
  await prisma.income.create({ data: { kind, amount, date, account, description, filePath } });
  await audit(admin.userId, "income.added", `${admin.name} recorded ${money(amount, settings.currencySymbol)} income: ${description}`);
  revalidateAll();
  return { ok: "Income recorded and shared with members." };
}

export async function deleteIncome(id: string): Promise<void> {
  const admin = await requireAdmin();
  const income = await prisma.income.findUniqueOrThrow({ where: { id } });
  if (await closedMonthError(income.date)) return;
  await prisma.income.delete({ where: { id } });
  await audit(admin.userId, "income.deleted", `${admin.name} deleted income “${income.description}” (${income.amount})`);
  revalidateAll();
}

/** Opening an FDR moves money between the society's own accounts: it's neither a cost nor income. */
export async function openFdr(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const bank = String(formData.get("bank") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const rate = Number(formData.get("rate")) || null;
  const opened = String(formData.get("openedOn") ?? "");
  const matures = String(formData.get("maturesOn") ?? "");
  if (!bank) return { error: "Enter the bank and term." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount." };
  if (!opened || !matures || matures <= opened) return { error: "Maturity must be after the opening date." };
  await prisma.fdr.create({ data: { bank, amount, rate, openedOn: new Date(opened), maturesOn: new Date(matures) } });
  await audit(admin.userId, "fdr.opened", `${admin.name} opened an FDR at ${bank}: ${amount}, matures ${matures}`);
  revalidateAll();
  return { ok: "FDR added." };
}

/** At maturity: the money moves back to savings. Record the profit separately as income. */
export async function closeFdr(id: string): Promise<void> {
  const admin = await requireAdmin();
  const fdr = await prisma.fdr.update({ where: { id }, data: { status: "CLOSED", closedOn: new Date() } });
  await audit(admin.userId, "fdr.closed", `${admin.name} closed the FDR at ${fdr.bank} (${fdr.amount})`);
  revalidateAll();
}
