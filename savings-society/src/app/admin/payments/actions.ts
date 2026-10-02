"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { deleteStoredFile } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}

/**
 * Approve/reject only act on a payment that's still PENDING, so two admins
 * clicking at once (or a double tap) can't process it twice.
 */
export async function approvePayment(paymentId: string): Promise<void> {
  const admin = await requireAdmin();
  await prisma.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: "APPROVED", reviewedById: admin.userId, reviewedAt: new Date() },
  });
  revalidateAll();
}

export async function rejectPayment(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Tell the member why, so they can fix it." };

  await prisma.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: "REJECTED", reviewNote: reason, reviewedById: admin.userId, reviewedAt: new Date() },
  });
  revalidateAll();
  return { ok: "Rejected." };
}

/** Undo an approval/rejection made by mistake: puts the payment back in the queue. */
export async function reopenPayment(paymentId: string): Promise<void> {
  await requireAdmin();
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PENDING", reviewNote: null, reviewedById: null, reviewedAt: null },
  });
  revalidateAll();
}

export async function deletePayment(paymentId: string): Promise<void> {
  await requireAdmin();
  const payment = await prisma.payment.delete({ where: { id: paymentId } });
  await deleteStoredFile(payment.proofPath);
  revalidateAll();
}
