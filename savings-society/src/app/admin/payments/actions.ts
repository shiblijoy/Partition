"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { deleteStoredFile } from "@/lib/uploads";
import { audit } from "@/lib/audit";
import { newVerifyCode, nextDepositReceiptNo } from "@/lib/receipts";
import type { FormState } from "@/components/ActionForm";

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}

/** Approves a pending payment and issues its receipt. Returns false if it was no longer pending. */
async function approve(paymentId: string, adminId: string, adminName: string): Promise<boolean> {
  let receiptNo = "";
  let count = 0;
  for (let attempt = 0; ; attempt++) {
    receiptNo = await nextDepositReceiptNo();
    try {
      // Only a PENDING payment changes, so two admins (or a double tap) can't approve it twice.
      ({ count } = await prisma.payment.updateMany({
        where: { id: paymentId, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: adminId, reviewedAt: new Date(), receiptNo, verifyCode: newVerifyCode() },
      }));
      break;
    } catch (err) {
      // Two approvals at the same moment can pick the same receipt number; take the next one.
      if (attempt >= 3 || !(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
    }
  }
  if (count) {
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { member: { select: { name: true } } } });
    const settings = await getSettings();
    await audit(adminId, "payment.approved", `${adminName} approved ${money(p.amount, settings.currencySymbol)} from ${p.member.name} (receipt ${receiptNo})`);
  }
  return count > 0;
}

export async function approvePayment(paymentId: string): Promise<void> {
  const admin = await requireAdmin();
  await approve(paymentId, admin.userId, admin.name);
  revalidateAll();
}

async function reject(paymentId: string, adminId: string, adminName: string, reason: string) {
  const { count } = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: "REJECTED", reviewNote: reason, reviewedById: adminId, reviewedAt: new Date() },
  });
  if (count) {
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { member: { select: { name: true } } } });
    await audit(adminId, "payment.rejected", `${adminName} rejected ${p.member.name}'s payment: ${reason}`);
  }
}

export async function rejectPayment(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Tell the member why, so they can fix it." };
  await reject(paymentId, admin.userId, admin.name, reason);
  revalidateAll();
  return { ok: "Rejected." };
}

/** Review page: approve or reject, then move on to the next proof in the queue. */
export async function decidePayment(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const decision = String(formData.get("decision") ?? "");
  const message = String(formData.get("message") ?? "").trim();

  if (decision === "approve") {
    const checks = formData.getAll("check");
    if (checks.length < 3) return { error: "Tick the checks first: money received, amount matches and transaction ID matches." };
    await approve(paymentId, admin.userId, admin.name);
    if (message) await prisma.payment.update({ where: { id: paymentId }, data: { reviewNote: message } });
  } else if (decision === "reject") {
    if (!message) return { error: "Write a message to the member saying why it's rejected." };
    await reject(paymentId, admin.userId, admin.name, message);
  } else {
    return { error: "Choose approve or reject." };
  }
  revalidateAll();
  const next = await prisma.payment.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  redirect(next ? `/admin/payments/${next.id}` : "/admin/payments");
}

/** Undo an approval/rejection made by mistake: puts the payment back in the queue (its receipt is withdrawn). */
export async function reopenPayment(paymentId: string): Promise<void> {
  const admin = await requireAdmin();
  const p = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PENDING", reviewNote: null, reviewedById: null, reviewedAt: null, receiptNo: null, verifyCode: null },
    include: { member: { select: { name: true } } },
  });
  await audit(admin.userId, "payment.reopened", `${admin.name} moved ${p.member.name}'s payment back to pending`);
  revalidateAll();
}

export async function deletePayment(paymentId: string): Promise<void> {
  const admin = await requireAdmin();
  const payment = await prisma.payment.delete({ where: { id: paymentId }, include: { member: { select: { name: true } } } });
  await deleteStoredFile(payment.proofPath);
  await audit(admin.userId, "payment.deleted", `${admin.name} deleted a ${payment.status.toLowerCase()} payment record of ${payment.member.name}`);
  revalidateAll();
}
