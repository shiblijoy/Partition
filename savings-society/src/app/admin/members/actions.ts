"use server";

import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { isMonthKey } from "@/lib/months";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

function readMemberFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: normalizePhone(String(formData.get("phone") ?? "").trim()),
    email: String(formData.get("email") ?? "").trim().toLowerCase() || null,
    joinMonth: String(formData.get("joinMonth") ?? ""),
  };
}

async function duplicateError(phone: string, email: string | null, exceptId?: string): Promise<string | null> {
  const clash = await prisma.user.findFirst({
    where: { OR: [{ phone }, ...(email ? [{ email }] : [])], ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (!clash) return null;
  return clash.phone === phone ? "Another account already uses that phone number." : "Another account already uses that email.";
}

export async function addMember(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { name, phone, email, joinMonth } = readMemberFields(formData);
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Name is required." };
  if (phone.length < 6) return { error: "Enter a valid phone number." };
  if (!isMonthKey(joinMonth)) return { error: "Choose the month they start depositing." };
  if (password.length < 8) return { error: "Starting password must be at least 8 characters." };
  const dup = await duplicateError(phone, email);
  if (dup) return { error: dup };

  await prisma.user.create({
    data: { name, phone, email, joinMonth, role: "MEMBER", passwordHash: await hashPassword(password) },
  });
  revalidatePath("/admin", "layout");
  return { ok: `${name} added. Share their phone number and password with them to log in.` };
}

export async function updateMember(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { name, phone, email, joinMonth } = readMemberFields(formData);
  const active = formData.get("active") === "on";

  if (!name) return { error: "Name is required." };
  if (phone.length < 6) return { error: "Enter a valid phone number." };
  if (!isMonthKey(joinMonth)) return { error: "Choose a valid join month." };
  const dup = await duplicateError(phone, email, memberId);
  if (dup) return { error: dup };

  await prisma.user.update({ where: { id: memberId }, data: { name, phone, email, joinMonth, active } });
  revalidatePath("/admin", "layout");
  return { ok: "Saved." };
}

export async function resetPassword(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  await prisma.user.update({ where: { id: memberId }, data: { passwordHash: await hashPassword(password) } });
  return { ok: "Password reset. Share the new password with the member." };
}

/** Admin records a payment directly (e.g. cash handed over at a meeting). It's approved immediately. */
export async function recordPayment(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const forMonth = String(formData.get("forMonth") ?? "");
  const amount = Number(formData.get("amount"));
  const method = String(formData.get("method") ?? "") as PaymentMethod;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidOnRaw = String(formData.get("paidOn") ?? "");
  const proof = formData.get("proof");

  if (!isMonthKey(forMonth)) return { error: "Choose the month." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a positive number." };
  if (!Object.values(PaymentMethod).includes(method)) return { error: "Choose a payment method." };

  let proofPath: string | null = null;
  if (proof instanceof File && proof.size > 0) {
    try {
      proofPath = await saveFile(`proofs/${memberId}`, proof);
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message };
      throw err;
    }
  }

  await prisma.payment.create({
    data: {
      memberId,
      forMonth,
      amount,
      method,
      reference,
      paidOn: paidOnRaw ? new Date(paidOnRaw) : new Date(),
      proofPath,
      status: "APPROVED",
      reviewedById: admin.userId,
      reviewedAt: new Date(),
      reviewNote: "Recorded by admin",
    },
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
  return { ok: "Payment recorded and approved." };
}
