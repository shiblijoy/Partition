"use server";

import { revalidatePath } from "next/cache";
import type { LandShareTiming } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, memberPosition } from "@/lib/society";
import { audit } from "@/lib/audit";
import { nextPayoutReceiptNo } from "@/lib/receipts";
import type { FormState } from "@/components/ActionForm";

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}

/**
 * Approves a withdrawal, freezing the settlement figures so they don't move
 * while the payout is arranged. The land share is either paid now (at the
 * current estimate) or owed until the land is sold.
 */
export async function approveWithdrawal(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id }, include: { member: true } });
  if (w.status !== "PENDING") return { error: "This request has already been handled." };
  const landTiming: LandShareTiming = formData.get("landTiming") === "NOW" ? "NOW" : "ON_SALE";

  const fund = await fundSummary();
  const pos = await memberPosition(w.memberId, fund);
  // A deceased member no longer counts in the fund summary, so share their part over members + them.
  const memberCountsInFund = w.member.active && !w.member.exit;
  const scale = memberCountsInFund || fund.activeMembers === 0 ? 1 : fund.activeMembers / (fund.activeMembers + 1);
  const profitShare = pos.profitShare * scale;
  const costShare = pos.costShare * scale;
  const landShare = Math.max(pos.landShare * scale, 0);

  const data =
    w.kind === "PARTIAL"
      ? { payable: w.amount ?? 0 }
      : {
          deposits: pos.deposits - pos.withdrawn,
          profitShare,
          costShare,
          landShare,
          landTiming,
          payable: pos.deposits - pos.withdrawn + profitShare - costShare + (landTiming === "NOW" ? landShare : 0),
        };
  if ((data.payable ?? 0) > fund.cash) {
    return { error: `Not enough cash: ${money(fund.cash, settings.currencySymbol)} available. Wait for deposits or an investment to return money.` };
  }

  await prisma.withdrawal.update({ where: { id }, data: { ...data, status: "APPROVED", approvedAt: new Date() } });
  await audit(admin.userId, "withdrawal.approved", `${admin.name} approved ${w.member.name}'s ${w.kind.toLowerCase()} withdrawal: ${money(data.payable ?? 0, settings.currencySymbol)} (${id})`);
  revalidateAll();
  return { ok: "Approved. Send the money, then record the payout." };
}

export async function declineWithdrawal(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Tell the member why." };
  const w = await prisma.withdrawal.update({ where: { id }, data: { status: "DECLINED", adminNote: note }, include: { member: true } });
  await audit(admin.userId, "withdrawal.declined", `${admin.name} declined ${w.member.name}'s withdrawal: ${note}`);
  revalidateAll();
  return { ok: "Declined." };
}

/** Back to pending, e.g. if the figures need recalculating before the money goes out. */
export async function reopenWithdrawal(id: string): Promise<void> {
  const admin = await requireAdmin();
  const w = await prisma.withdrawal.update({
    where: { id, status: "APPROVED" },
    data: { status: "PENDING", approvedAt: null, deposits: null, profitShare: null, costShare: null, landShare: null, landTiming: null, payable: null },
    include: { member: true },
  });
  await audit(admin.userId, "withdrawal.reopened", `${admin.name} reopened ${w.member.name}'s withdrawal`);
  revalidateAll();
}

/** The money has been sent: issue the payout receipt. A full settlement ends the membership. */
export async function recordPayout(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const reference = String(formData.get("reference") ?? "").trim();
  const paidOnRaw = String(formData.get("paidOn") ?? "");
  if (!reference) return { error: "Enter the transaction ID of the transfer." };

  const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id }, include: { member: true } });
  if (w.status !== "APPROVED") return { error: "Approve the settlement first." };
  const paidAt = paidOnRaw ? new Date(paidOnRaw) : new Date();

  await prisma.withdrawal.update({
    where: { id },
    data: { status: "PAID", paidAt, paidReference: reference, receiptNo: await nextPayoutReceiptNo(paidAt) },
  });
  if (w.kind !== "PARTIAL") {
    await prisma.user.update({
      where: { id: w.memberId },
      data: { exit: w.exitAs ?? (w.kind === "NOMINEE" ? "DECEASED" : "LEFT"), exitedAt: paidAt },
    });
  }
  await audit(admin.userId, "payout.paid", `${admin.name} paid ${money(w.payable ?? 0, settings.currencySymbol)} to ${w.member.name} (${id})`);
  revalidateAll();
  return { ok: "Payout recorded and receipt issued." };
}

/** For a nominee settlement (the member can't confirm themselves). */
export async function confirmForNominee(id: string): Promise<void> {
  const admin = await requireAdmin();
  const w = await prisma.withdrawal.update({ where: { id, status: "PAID", kind: "NOMINEE" }, data: { memberConfirmedAt: new Date() }, include: { member: true } });
  await audit(admin.userId, "payout.confirmed", `${admin.name} confirmed the nominee of ${w.member.name} received the settlement`);
  revalidateAll();
}
