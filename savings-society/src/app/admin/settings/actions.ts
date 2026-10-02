"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { isMonthKey } from "@/lib/months";
import type { FormState } from "@/components/ActionForm";

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const societyName = String(formData.get("societyName") ?? "").trim();
  const monthlyAmount = Number(formData.get("monthlyAmount"));
  const currencySymbol = String(formData.get("currencySymbol") ?? "").trim();
  const startMonth = String(formData.get("startMonth") ?? "");
  const paymentInfo = String(formData.get("paymentInfo") ?? "").trim() || null;

  if (!societyName) return { error: "Society name is required." };
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return { error: "Monthly amount must be positive." };
  if (!currencySymbol) return { error: "Currency symbol is required." };
  if (!isMonthKey(startMonth)) return { error: "Choose the society's first month." };

  await prisma.setting.update({
    where: { id: 1 },
    data: { societyName, monthlyAmount, currencySymbol, startMonth, paymentInfo },
  });
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
