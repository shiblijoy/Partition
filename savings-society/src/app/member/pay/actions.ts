"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { isMonthKey } from "@/lib/months";
import { saveFile, UploadError } from "@/lib/uploads";

export type PayState = { error?: string };

export async function submitPayment(_prev: PayState, formData: FormData): Promise<PayState> {
  const session = await requireMember();

  const forMonth = String(formData.get("forMonth") ?? "");
  const amount = Number(formData.get("amount"));
  const method = String(formData.get("method") ?? "") as PaymentMethod;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidOnRaw = String(formData.get("paidOn") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const proof = formData.get("proof");

  if (!isMonthKey(forMonth)) return { error: "Choose which month this payment is for." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a positive number." };
  if (!Object.values(PaymentMethod).includes(method)) return { error: "Choose how you paid." };
  if (!(proof instanceof File) || proof.size === 0) {
    return { error: "Attach a screenshot or photo of your payment receipt." };
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
      forMonth,
      amount,
      method,
      reference,
      paidOn: paidOnRaw ? new Date(paidOnRaw) : new Date(),
      proofPath,
      note,
    },
  });

  revalidatePath("/member");
  revalidatePath("/admin");
  redirect("/member/history?submitted=1");
}
