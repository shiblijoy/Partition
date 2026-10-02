"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { isMonthKey } from "@/lib/months";
import { saveFile, UploadError } from "@/lib/uploads";

export type PayState = { error?: string };

/** One transfer can cover several months; the amount is worked out here from the monthly deposit. */
export async function submitPayment(_prev: PayState, formData: FormData): Promise<PayState> {
  const session = await requireMember();
  const settings = await getSettings();

  const months = [...new Set(formData.getAll("months").map(String))].filter(isMonthKey).sort();
  const method = String(formData.get("method") ?? "") as PaymentMethod;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidOnRaw = String(formData.get("paidOn") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const proof = formData.get("proof");

  if (months.length === 0) return { error: "Pick the month (or months) you're paying for." };
  if (!Object.values(PaymentMethod).includes(method)) return { error: "Choose how you paid." };
  if (method !== "CASH" && !reference) return { error: "Enter the transaction ID or reference so the admin can find it." };
  if (!(proof instanceof File) || proof.size === 0) {
    return { error: "Add a screenshot or photo of your payment receipt." };
  }

  let proofPath: string;
  try {
    proofPath = await saveFile(`proofs/${session.userId}`, proof);
  } catch (err) {
    if (err instanceof UploadError) return { error: err.message };
    throw err;
  }

  await prisma.payment.create({
    data: {
      memberId: session.userId,
      forMonth: months[0],
      monthsCount: months.length,
      amount: months.length * settings.monthlyAmount,
      method,
      reference,
      paidOn: paidOnRaw ? new Date(paidOnRaw) : new Date(),
      proofPath,
      note: months.length > 1 ? [`Covers ${months.join(", ")}`, note].filter(Boolean).join(" · ") : note,
    },
  });

  revalidatePath("/member", "layout");
  revalidatePath("/admin", "layout");
  redirect("/member/history?submitted=1");
}
