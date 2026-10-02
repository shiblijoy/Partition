"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword, temporaryPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { getSettings, money } from "@/lib/settings";
import { isMonthKey } from "@/lib/months";
import { whatsappLink } from "@/lib/format";
import { audit } from "@/lib/audit";
import { newVerifyCode, nextDepositReceiptNo } from "@/lib/receipts";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

async function duplicatePhone(phone: string, exceptId?: string): Promise<boolean> {
  const clash = await prisma.user.findFirst({ where: { phone, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  return !!clash;
}

function inviteMessage(name: string, phone: string, password: string, society: string, first: boolean): string {
  return first
    ? `Assalamu alaikum ${name.split(" ")[0]}, you've been added to ${society}. Log in to the app with your mobile number ${phone} and temporary password ${password}. You'll be asked to set your own password.`
    : `Your ${society} password has been reset. Log in with ${phone} and temporary password ${password}, then set your own password.`;
}

/**
 * Adds a member with a temporary password they must change at first login.
 * Joining rule: start from this month, or catch up on every month since the society started.
 */
export async function addMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const name = text(formData, "name") ?? "";
  const phone = normalizePhone(text(formData, "phone") ?? "");
  const rule = String(formData.get("rule") ?? "fresh");
  const firstMonth = String(formData.get("joinMonth") ?? "");

  if (!name) return { error: "Name is required." };
  if (!/^\+?\d{10,14}$/.test(phone)) return { error: "Enter a valid mobile number." };
  if (rule === "fresh" && !isMonthKey(firstMonth)) return { error: "Choose their first month." };
  if (await duplicatePhone(phone)) return { error: "Another account already uses that mobile number." };

  const password = temporaryPassword();
  const last = await prisma.user.aggregate({ _max: { memberNo: true } });
  await prisma.user.create({
    data: {
      name,
      phone,
      joinMonth: rule === "catchup" ? settings.startMonth : firstMonth,
      memberNo: (last._max.memberNo ?? 0) + 1,
      role: "MEMBER",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  await audit(admin.userId, "member.added", `${admin.name} added ${name} (${phone})${rule === "catchup" ? ", paying back all past months" : ""}`);
  revalidateAll();
  return {
    ok: `${name} added. Temporary password: ${password}`,
    link: { href: whatsappLink(phone, inviteMessage(name, phone, password, settings.societyName, true)), label: "Send invite on WhatsApp" },
  };
}

export async function updateMember(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const name = text(formData, "name") ?? "";
  const phone = normalizePhone(text(formData, "phone") ?? "");
  const joinMonth = String(formData.get("joinMonth") ?? "");

  if (!name) return { error: "Name is required." };
  if (!/^\+?\d{10,14}$/.test(phone)) return { error: "Enter a valid mobile number." };
  if (!isMonthKey(joinMonth)) return { error: "Choose a valid first month." };
  if (await duplicatePhone(phone, memberId)) return { error: "Another account already uses that mobile number." };

  await prisma.user.update({
    where: { id: memberId },
    data: {
      name,
      phone,
      joinMonth,
      nid: text(formData, "nid"),
      dateOfBirth: text(formData, "dateOfBirth"),
      address: text(formData, "address"),
      nomineeName: text(formData, "nomineeName"),
      nomineeRelation: text(formData, "nomineeRelation"),
      nomineePhone: text(formData, "nomineePhone"),
      nomineeNid: text(formData, "nomineeNid"),
    },
  });
  await audit(admin.userId, "member.updated", `${admin.name} updated ${name}'s details`);
  revalidateAll();
  return { ok: "Saved." };
}

/** Issues a new temporary password and signs the member out everywhere. */
export async function resetPassword(memberId: string): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const password = temporaryPassword();
  const member = await prisma.user.update({
    where: { id: memberId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true, passwordChangedAt: new Date() },
  });
  await audit(admin.userId, "member.password_reset", `${admin.name} reset ${member.name}'s password`);
  return {
    ok: `New temporary password: ${password}`,
    link: { href: whatsappLink(member.phone, inviteMessage(member.name, member.phone, password, settings.societyName, false)), label: "Send on WhatsApp" },
  };
}

/** Admin records money received directly (cash, or a member who doesn't use the app). Approved at once, with receipts. */
export async function recordPayment(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const months = [...new Set(formData.getAll("months").map(String))].filter(isMonthKey).sort();
  const method = String(formData.get("method") ?? "") as PaymentMethod;
  const paidOnRaw = String(formData.get("paidOn") ?? "");
  const reference = text(formData, "reference");
  const proof = formData.get("proof");

  if (months.length === 0) return { error: "Pick at least one month." };
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

  // One receipt per month, as members expect a receipt for each month they've paid.
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  for (const month of months) {
    await prisma.payment.create({
      data: {
        memberId,
        forMonth: month,
        amount: settings.monthlyAmount,
        method,
        reference,
        paidOn: paidOnRaw ? new Date(paidOnRaw) : new Date(),
        proofPath,
        status: "APPROVED",
        reviewedById: admin.userId,
        reviewedAt: new Date(),
        reviewNote: "Recorded by admin",
        receiptNo: await nextDepositReceiptNo(),
        verifyCode: newVerifyCode(),
      },
    });
  }
  await audit(
    admin.userId,
    "payment.recorded",
    `${admin.name} recorded ${money(months.length * settings.monthlyAmount, settings.currencySymbol)} (${months.length} month${months.length > 1 ? "s" : ""}, ${method.toLowerCase()}) for ${member.name}`
  );
  revalidateAll();
  return {
    ok: `Recorded. ${months.length} receipt${months.length > 1 ? "s" : ""} issued.`,
    link: {
      href: whatsappLink(member.phone, `${settings.societyName}: we received ${money(months.length * settings.monthlyAmount, settings.currencySymbol)} from you for ${months.length} month${months.length > 1 ? "s" : ""}. Your receipts are in the app. Thank you!`),
      label: `Tell ${member.name.split(" ")[0]} on WhatsApp`,
    },
  };
}

/** Removing a member opens a settlement, like a withdrawal; they stop being a member once it's paid. */
export async function removeMember(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const reason = text(formData, "reason");
  if (!reason) return { error: "Give a reason (it's kept in the audit log)." };
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const open = await prisma.withdrawal.findFirst({ where: { memberId, status: { in: ["PENDING", "APPROVED"] } } });
  if (open) return { error: "This member already has a settlement open." };
  const w = await prisma.withdrawal.create({
    data: { memberId, kind: "FULL", exitAs: "REMOVED", payTo: `bKash ${member.phone}`, reason, adminNote: `Removed by ${admin.name}` },
  });
  await audit(admin.userId, "member.removed", `${admin.name} started removing ${member.name}: ${reason}`);
  revalidateAll();
  redirect(`/admin/withdrawals/${w.id}`);
}

/** Records a member's death: they stop counting as a member, and a settlement to their nominee is opened. */
export async function markDeceased(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const dateRaw = String(formData.get("date") ?? "");
  const certificate = formData.get("certificate");
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  if (!dateRaw) return { error: "Enter the date of death." };
  if (!member.nomineeName) return { error: "Add the nominee's details first (Edit details below)." };

  let attachmentPath: string | null = null;
  if (certificate instanceof File && certificate.size > 0) {
    try {
      attachmentPath = await saveFile("statements/deaths", certificate);
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message };
      throw err;
    }
  }
  await prisma.withdrawal.updateMany({ where: { memberId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "CANCELLED" } });
  const w = await prisma.withdrawal.create({
    data: {
      memberId,
      kind: "NOMINEE",
      exitAs: "DECEASED",
      payTo: `${member.nomineeName}${member.nomineePhone ? ` · ${member.nomineePhone}` : ""}`,
      reason: `Died ${dateRaw}`,
      attachmentPath,
    },
  });
  // Their login stops at once; the settlement is paid to the nominee.
  await prisma.user.update({ where: { id: memberId }, data: { active: false } });
  await audit(admin.userId, "member.deceased", `${admin.name} recorded the death of ${member.name} (${dateRaw}); settlement to ${member.nomineeName} opened`);
  revalidateAll();
  redirect(`/admin/withdrawals/${w.id}`);
}

/** Brings back a member who was removed or left by mistake. */
export async function restoreMember(memberId: string): Promise<void> {
  const admin = await requireAdmin();
  await prisma.withdrawal.updateMany({ where: { memberId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "CANCELLED" } });
  const member = await prisma.user.update({ where: { id: memberId }, data: { active: true, exit: null, exitedAt: null } });
  await audit(admin.userId, "member.restored", `${admin.name} restored ${member.name}`);
  revalidateAll();
}

export async function closeRequest(requestId: string): Promise<void> {
  await requireAdmin();
  await prisma.memberRequest.update({ where: { id: requestId }, data: { status: "DONE" } });
  revalidatePath("/admin", "layout");
}

