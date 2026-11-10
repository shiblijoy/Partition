import type { LandShareTiming } from "@prisma/client";
import { accountOrDefault, cashAt, post } from "@/lib/books";
import { fundSummary, memberPosition } from "@/lib/society";
import { issueReceipt } from "@/lib/receipts";
import { queueNotification } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ServiceError } from "@/lib/errors";
import { money, type Settings } from "@/lib/settings";
import { secondApproval } from "@/lib/services/investments";
import { inTx, type Actor } from "@/lib/services/payments";

const LABEL = { FULL: "exit settlement", PARTIAL: "partial withdrawal", NOMINEE: "nominee settlement", LAND_SHARE: "land share" } as const;

/**
 * FR-WD-04..06: the admin reviews the settlement, chooses when the land share
 * is paid, and approves. BR-07 blocks a payout larger than the cash available;
 * BR-09 freezes the figures (and the member's shares) on approval.
 */
export async function approveWithdrawal(settings: Settings, id: string, a: { landTiming: LandShareTiming; actor: Actor }) {
  return inTx(async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id }, include: { member: true } });
    if (!w || w.status !== "PENDING") throw new ServiceError("This request has already been handled.");
    const fund = await fundSummary(tx);
    const pos = await memberPosition(w.memberId, fund, tx);

    let data: { deposits?: number; profitShare?: number; costShare?: number; landShare?: number; landTiming?: LandShareTiming; payable: number };
    if (w.kind === "PARTIAL") {
      if ((w.amount ?? 0) > pos.net) throw new ServiceError("The request is more than the member's current net value.");
      data = { payable: w.amount ?? 0 };
    } else if (w.kind === "LAND_SHARE") {
      data = { payable: w.amount ?? 0 };
    } else {
      const deposits = pos.deposits - pos.withdrawn;
      const landShare = Math.max(pos.landShare, 0);
      data = {
        deposits,
        profitShare: pos.profitShare,
        costShare: pos.costShare,
        landShare,
        landTiming: a.landTiming,
        payable: deposits + pos.profitShare - pos.costShare + (a.landTiming === "NOW" ? landShare : 0),
      };
    }
    if (data.payable > fund.cash) {
      throw new ServiceError(`Not enough cash: ${money(fund.cash, settings.currencySymbol)} available. Wait for deposits or an investment to return money.`);
    }
    if (secondApproval(settings.dualApprovalLimit, data.payable, w.firstApprover, a.actor) === "first") {
      await tx.withdrawal.update({ where: { id }, data: { firstApprover: a.actor.id, landTiming: data.landTiming ?? null } });
      await audit(a.actor.id, "withdrawal.first_approval", `${a.actor.name} approved ${w.member.name}'s ${LABEL[w.kind]} of ${money(data.payable, settings.currencySymbol)}; a second admin must confirm`, { db: tx, entity: `withdrawal:${id}` });
      return "waiting" as const;
    }
    if (w.kind === "FULL" || w.kind === "NOMINEE") await tx.allocation.updateMany({ where: { memberId: w.memberId }, data: { frozen: true } });
    await tx.withdrawal.update({ where: { id }, data: { ...data, status: "APPROVED", approvedAt: new Date(), approvedBy: a.actor.name } });
    await queueNotification(tx, { userId: w.memberId, kind: "withdrawal", title: "Withdrawal approved", body: `Your ${LABEL[w.kind]} was approved. The admin will send the money and issue a payout receipt.`, url: "/member/withdraw" });
    await audit(a.actor.id, "withdrawal.approved", `${a.actor.name} approved ${w.member.name}'s ${LABEL[w.kind]}: ${money(data.payable, settings.currencySymbol)}`, { db: tx, entity: `withdrawal:${id}`, after: data });
    return "approved" as const;
  });
}

export async function declineWithdrawal(id: string, note: string, actor: Actor) {
  if (!note.trim()) throw new ServiceError("Tell the member why.");
  return inTx(async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id }, include: { member: true } });
    if (!w || w.status !== "PENDING") throw new ServiceError("This request has already been handled.");
    await tx.withdrawal.update({ where: { id }, data: { status: "DECLINED", adminNote: note } });
    await queueNotification(tx, { userId: w.memberId, kind: "withdrawal", title: "Withdrawal declined", body: note, url: "/member/withdraw" });
    await audit(actor.id, "withdrawal.declined", `${actor.name} declined ${w.member.name}'s withdrawal: ${note}`, { db: tx, entity: `withdrawal:${id}` });
  });
}

/** Back to pending before the money goes out, e.g. to recalculate. The member's shares unfreeze. */
export async function reopenWithdrawal(id: string, actor: Actor) {
  return inTx(async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id }, include: { member: true } });
    if (!w || w.status !== "APPROVED") throw new ServiceError("Only an approved, unpaid settlement can be reopened.");
    await tx.withdrawal.update({
      where: { id },
      data: { status: "PENDING", approvedAt: null, approvedBy: null, firstApprover: null, deposits: null, profitShare: null, costShare: null, landShare: null, landTiming: null, payable: null },
    });
    if (w.kind === "FULL" || w.kind === "NOMINEE") await tx.allocation.updateMany({ where: { memberId: w.memberId }, data: { frozen: false } }); // reversed items are never re-split, so unfreezing is safe
    await audit(actor.id, "withdrawal.reopened", `${actor.name} reopened ${w.member.name}'s withdrawal`, { db: tx, entity: `withdrawal:${id}` });
  });
}

/**
 * FR-WD-07: the money has been sent. The payout is a ledger entry, a WD- receipt
 * is issued, and a full settlement ends the membership (status Left).
 */
export async function recordPayout(settings: Settings, id: string, p: { reference: string; paidAt: Date; accountId?: string | null; actor: Actor }) {
  if (!p.reference.trim()) throw new ServiceError("Enter the transaction ID of the transfer.");
  return inTx(async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id }, include: { member: true } });
    if (!w || w.status !== "APPROVED" || w.payable == null) throw new ServiceError("Approve the settlement first.");
    const accountId = await accountOrDefault(tx, p.accountId);
    if (w.payable > (await cashAt(tx, undefined, accountId))) throw new ServiceError("That account doesn't hold enough. Choose another account or move money into it first.");
    await post(tx, { date: p.paidAt, type: "PAYOUT", amount: -w.payable, accountId, memberId: w.memberId, sourceType: "withdrawal", sourceId: id, note: LABEL[w.kind], createdBy: p.actor.name });
    await tx.withdrawal.update({ where: { id }, data: { status: "PAID", paidAt: p.paidAt, paidReference: p.reference, paidBy: p.actor.name, accountId } });
    await issueReceipt(tx, { kind: "PAYOUT", memberId: w.memberId, amount: w.payable, withdrawalId: id, issuedBy: p.actor.name, date: p.paidAt });
    if (w.kind === "FULL" || w.kind === "NOMINEE") {
      await tx.user.update({ where: { id: w.memberId }, data: { exit: w.exitAs ?? (w.kind === "NOMINEE" ? "DECEASED" : "LEFT"), exitedAt: p.paidAt } });
    }
    await queueNotification(tx, { userId: w.memberId, kind: "withdrawal", title: "Money sent", body: `Your ${LABEL[w.kind]} was paid. Open the payout receipt and confirm you received it.`, url: `/member/payouts/${id}` });
    await audit(p.actor.id, "payout.paid", `${p.actor.name} paid ${money(w.payable, settings.currencySymbol)} to ${w.member.name} (${LABEL[w.kind]})`, { db: tx, entity: `withdrawal:${id}` });
  });
}

/** FR-WD-08: land shares left owed "when the land is sold", not yet paid. */
export async function owedLandShares() {
  const { prisma } = await import("@/lib/prisma");
  const parents = await prisma.withdrawal.findMany({
    where: { status: "PAID", landTiming: "ON_SALE", landShare: { gt: 0 }, kind: { in: ["FULL", "NOMINEE"] } },
    include: { member: { select: { name: true } } },
    orderBy: { paidAt: "asc" },
  });
  const children = await prisma.withdrawal.findMany({ where: { kind: "LAND_SHARE", parentId: { in: parents.map((p) => p.id) }, status: { notIn: ["DECLINED", "CANCELLED"] } } });
  return parents.map((p) => ({ ...p, follow: children.find((c) => c.parentId === p.id) ?? null }));
}

/** Opens the payout of an owed land share once the land is sold. It goes through approve → pay like any payout. */
export async function startLandSharePayout(parentId: string, actor: Actor) {
  return inTx(async (tx) => {
    const p = await tx.withdrawal.findUnique({ where: { id: parentId }, include: { member: true } });
    if (!p || p.landTiming !== "ON_SALE" || !p.landShare) throw new ServiceError("No land share is owed on this settlement.");
    if (await tx.withdrawal.findFirst({ where: { parentId, kind: "LAND_SHARE", status: { notIn: ["DECLINED", "CANCELLED"] } } })) throw new ServiceError("This land share is already being paid.");
    const w = await tx.withdrawal.create({
      data: { memberId: p.memberId, kind: "LAND_SHARE", parentId, amount: p.landShare, payTo: p.payTo, reason: "Land share owed from the exit settlement" },
    });
    await audit(actor.id, "withdrawal.land_share", `${actor.name} opened the owed land share payout for ${p.member.name}`, { db: tx, entity: `withdrawal:${w.id}` });
    return w;
  });
}
