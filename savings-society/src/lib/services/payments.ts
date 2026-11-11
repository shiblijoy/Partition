import { randomUUID } from "crypto";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountOrDefault, assertOpenMonth, checkCaughtUp, post, reverseSource, type Db } from "@/lib/books";
import { issueReceipt } from "@/lib/receipts";
import { queueNotification } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ServiceError, isUniqueViolation } from "@/lib/errors";
import { addMonths, currentMonth, isMonthKey, monthLabel } from "@/lib/months";
import { rateFor } from "@/lib/rates";
import { firstMonthOf } from "@/lib/ledger";
import { money, type Settings } from "@/lib/settings";

export type Actor = { id: string; name: string };

/** Interactive transaction with a retry when two approvals race for the same receipt number. */
export async function inTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), { timeout: 30_000 });
    } catch (err) {
      const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
      if (attempt < 3 && isUniqueViolation(err) && target.includes("receiptNo")) continue;
      throw err;
    }
  }
}

/** The payments that were submitted together with this one (one transfer for several months). */
async function batchOf(db: Db, paymentId: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new ServiceError("Payment not found.");
  return p.batchId ? db.payment.findMany({ where: { batchId: p.batchId }, orderBy: { forMonth: "asc" } }) : [p];
}

/** Months a member can still submit for: from their first month, not yet pending or approved (up to a year ahead). */
/** Every month the member can still pay: all unpaid months since they joined, and up to 12 months ahead. */
export async function openMonths(memberId: string, settings: Settings, count = Infinity): Promise<string[]> {
  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const taken = new Set((await prisma.monthSlot.findMany({ where: { memberId }, select: { month: true } })).map((s) => s.month));
  const first = firstMonthOf(member, settings.startMonth);
  const last = addMonths(currentMonth(), 12);
  const out: string[] = [];
  for (let m = first; m <= last && out.length < count; m = addMonths(m, 1)) if (!taken.has(m)) out.push(m);
  return out;
}

/**
 * FR-PAY-09: a transaction ID used before by anyone. Rejected payments don't
 * count (the member may resubmit the same transfer with a clearer proof).
 */
export async function duplicateReference(reference: string | null, exceptBatch?: string | null) {
  if (!reference) return [];
  const rows = await prisma.payment.findMany({
    where: { reference: reference.trim(), status: { in: ["PENDING", "APPROVED", "REVERSED"] }, ...(exceptBatch ? { NOT: { batchId: exceptBatch } } : {}) },
    include: { member: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

type SubmitInput = {
  memberId: string;
  months: string[];
  method: PaymentMethod;
  reference: string | null;
  paidOn: Date;
  proofPath: string | null;
  note: string | null;
  recordedBy?: string | null;
  paidToId?: string | null; // the society bank account the member says they paid into
};

/**
 * Creates one pending payment per month, linked by a batch id (FR-PAY-10). The
 * amount is the rate in force for each month and can't be changed (FR-PAY-02).
 * A month that already has a pending or approved payment is refused by the
 * MonthSlot primary key (FR-PAY-07, BR-02).
 */
async function createBatch(db: Db, settings: Settings, input: SubmitInput) {
  if (input.method !== "BANK") throw new ServiceError("Only bank payments are accepted.");
  if (input.paidToId && !(await db.account.findFirst({ where: { id: input.paidToId, active: true, type: "BANK" } }))) throw new ServiceError("Choose one of the society's bank accounts.");
  const months = [...new Set(input.months)].filter(isMonthKey).sort();
  if (months.length === 0) throw new ServiceError("Pick the month (or months) you're paying for.");
  const member = await db.user.findUniqueOrThrow({ where: { id: input.memberId } });
  const first = firstMonthOf(member, settings.startMonth);
  if (months[0] < first) throw new ServiceError(`Payments start from ${monthLabel(first, "long")}.`);
  if (months[months.length - 1] > addMonths(currentMonth(), 12)) throw new ServiceError("You can pay up to 12 months ahead.");

  const batchId = months.length > 1 ? randomUUID() : null;
  const created = [];
  for (const forMonth of months) {
    const payment = await db.payment.create({
      data: {
        memberId: input.memberId,
        forMonth,
        batchId,
        amount: rateFor(forMonth, settings.rates),
        method: input.method,
        reference: input.reference,
        paidOn: input.paidOn,
        proofPath: input.proofPath,
        paidToId: input.paidToId ?? null,
        note: input.note,
        recordedBy: input.recordedBy ?? null,
      },
    });
    try {
      await db.monthSlot.create({ data: { memberId: input.memberId, month: forMonth, paymentId: payment.id } });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ServiceError(`${monthLabel(forMonth, "long")} already has a payment waiting for approval or approved.`);
      throw err;
    }
    created.push(payment);
  }
  return created;
}

export async function submitPayments(settings: Settings, input: SubmitInput) {
  if (!input.reference) throw new ServiceError("Enter the bank transaction ID or reference so the admin can find it.");
  return inTx((tx) => createBatch(tx, settings, input));
}

type ApproveInput = { receivedOn: Date; accountId?: string | null; actor: Actor; note?: string | null; at?: Date /* backdating, for imports and the demo seed */ };

/**
 * FR-APR-05: in one transaction, every pending payment of the batch is marked
 * approved, gets a deposit ledger entry and its own receipt, the member is
 * notified, and the audit log is written. Returns how many were approved.
 */
async function approveIn(db: Db, settings: Settings, paymentId: string, input: ApproveInput): Promise<number> {
  const batch = (await batchOf(db, paymentId)).filter((p) => p.status === "PENDING");
  if (batch.length === 0) return 0;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (input.receivedOn > endOfToday) throw new ServiceError("The date received can't be in the future.");
  await assertOpenMonth(db, input.receivedOn);
  const accountId = await accountOrDefault(db, input.accountId);
  const member = await db.user.findUniqueOrThrow({ where: { id: batch[0].memberId } });

  for (const p of batch) {
    // Only a PENDING payment changes, so two admins (or a double tap) can't approve it twice.
    const { count } = await db.payment.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: "APPROVED", receivedOn: input.receivedOn, accountId, reviewedById: input.actor.id, reviewedAt: input.at ?? new Date(), reviewNote: input.note ?? p.reviewNote },
    });
    if (!count) continue;
    await post(db, { date: input.receivedOn, type: "DEPOSIT", amount: p.amount, accountId, memberId: p.memberId, sourceType: "payment", sourceId: p.id, createdBy: input.actor.name });
    await issueReceipt(db, { kind: "DEPOSIT", memberId: p.memberId, amount: p.amount, paymentId: p.id, issuedBy: input.actor.name, date: input.at });
  }
  const total = batch.reduce((s, p) => s + p.amount, 0);
  const months = batch.map((p) => monthLabel(p.forMonth)).join(", ");
  await queueNotification(db, {
    userId: member.id,
    kind: "payment_approved",
    title: "Payment approved",
    body: `${money(total, settings.currencySymbol)} for ${months} reached the society account. Your receipt${batch.length > 1 ? "s are" : " is"} ready.`,
    url: "/member/history",
  });
  await audit(input.actor.id, "payment.approved", `${input.actor.name} approved ${money(total, settings.currencySymbol)} from ${member.name} for ${months}`, {
    db,
    entity: `payment:${paymentId}`,
    after: { status: "APPROVED", receivedOn: input.receivedOn, accountId, months: batch.map((p) => p.forMonth) },
  });
  await checkCaughtUp(db, member.id, (await db.payment.findMany({ where: { memberId: member.id }, select: { forMonth: true } })).map((p) => p.forMonth));
  return batch.length;
}

export async function approvePayment(settings: Settings, paymentId: string, input: ApproveInput) {
  return inTx((tx) => approveIn(tx, settings, paymentId, input));
}

/** FR-APR-04: rejecting needs a reason the member sees; the months free up for a new submission (FR-PAY-08). */
export async function rejectPayment(settings: Settings, paymentId: string, reason: string, actor: Actor) {
  if (!reason.trim()) throw new ServiceError("Tell the member why, so they can fix it.");
  return inTx(async (tx) => {
    const batch = (await batchOf(tx, paymentId)).filter((p) => p.status === "PENDING");
    if (batch.length === 0) return 0;
    const member = await tx.user.findUniqueOrThrow({ where: { id: batch[0].memberId } });
    for (const p of batch) {
      await tx.payment.update({ where: { id: p.id }, data: { status: "REJECTED", reviewNote: reason, reviewedById: actor.id, reviewedAt: new Date() } });
      await tx.monthSlot.deleteMany({ where: { paymentId: p.id } });
    }
    const months = batch.map((p) => monthLabel(p.forMonth)).join(", ");
    await queueNotification(tx, {
      userId: member.id,
      kind: "payment_rejected",
      title: "Payment not approved",
      body: `${months}: ${reason}. You can submit it again.`,
      url: "/member/history",
      whatsapp: { template: "payment_rejected", params: [member.name.split(" ")[0], months, reason] },
    });
    await audit(actor.id, "payment.rejected", `${actor.name} rejected ${member.name}'s payment for ${months}: ${reason}`, {
      db: tx,
      entity: `payment:${paymentId}`,
      before: { status: "PENDING" },
      after: { status: "REJECTED", reason },
    });
    return batch.length;
  });
}

/**
 * FR-APR-06: an approval made by mistake is undone by a reversing entry with a
 * reason. The receipt is marked cancelled, not deleted, and the month is due again.
 */
export async function reversePayment(settings: Settings, paymentId: string, reason: string, actor: Actor) {
  if (!reason.trim()) throw new ServiceError("Give the reason for reversing this approval.");
  return inTx(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { member: true } });
    if (!p || p.status !== "APPROVED") throw new ServiceError("Only an approved payment can be reversed.");
    await reverseSource(tx, "payment", p.id, { note: reason, createdBy: actor.name });
    await tx.payment.update({ where: { id: p.id }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason } });
    await tx.receipt.updateMany({ where: { paymentId: p.id, cancelledAt: null }, data: { cancelledAt: new Date(), cancelReason: reason } });
    await tx.monthSlot.deleteMany({ where: { paymentId: p.id } });
    await queueNotification(tx, {
      userId: p.memberId,
      kind: "payment_reversed",
      title: "Approval reversed",
      body: `The approval for ${monthLabel(p.forMonth, "long")} was reversed: ${reason}. The receipt is cancelled and the month is due again.`,
      url: "/member/history",
    });
    await audit(actor.id, "payment.reversed", `${actor.name} reversed ${money(p.amount, settings.currencySymbol)} from ${p.member.name} for ${monthLabel(p.forMonth)}: ${reason}`, {
      db: tx,
      entity: `payment:${p.id}`,
      before: { status: "APPROVED" },
      after: { status: "REVERSED", reason },
    });
  });
}

/** A rejection made by mistake goes back to the queue, if the months are still free. */
export async function reopenRejected(paymentId: string, actor: Actor) {
  return inTx(async (tx) => {
    const batch = (await batchOf(tx, paymentId)).filter((p) => p.status === "REJECTED");
    for (const p of batch) {
      try {
        await tx.monthSlot.create({ data: { memberId: p.memberId, month: p.forMonth, paymentId: p.id } });
      } catch (err) {
        if (isUniqueViolation(err)) throw new ServiceError(`${monthLabel(p.forMonth, "long")} has been paid again since; this one stays rejected.`);
        throw err;
      }
      await tx.payment.update({ where: { id: p.id }, data: { status: "PENDING", reviewNote: null, reviewedById: null, reviewedAt: null } });
    }
    if (batch.length) await audit(actor.id, "payment.reopened", `${actor.name} moved a rejected payment back to the queue`, { db: tx, entity: `payment:${paymentId}` });
  });
}

/**
 * FR-PAY-11 / UC-09: the admin records money received directly. Months that
 * already have a payment are skipped with a warning; the rest are approved at
 * once, marked "Recorded by admin", with a receipt each.
 */
export async function recordForMember(
  settings: Settings,
  input: { memberId: string; months: string[]; method: PaymentMethod; reference: string | null; receivedOn: Date; proofPath: string | null; accountId?: string | null; actor: Actor }
) {
  const taken = new Set((await prisma.monthSlot.findMany({ where: { memberId: input.memberId, month: { in: input.months } } })).map((s) => s.month));
  const months = input.months.filter((m) => !taken.has(m));
  const skipped = input.months.filter((m) => taken.has(m));
  if (months.length === 0) throw new ServiceError("Every month you picked already has a payment.");
  const approved = await inTx(async (tx) => {
    const created = await createBatch(tx, settings, {
      memberId: input.memberId,
      months,
      method: input.method,
      reference: input.reference,
      paidOn: input.receivedOn,
      proofPath: input.proofPath,
      note: null,
      recordedBy: input.actor.name,
    });
    return approveIn(tx, settings, created[0].id, { receivedOn: input.receivedOn, accountId: input.accountId, actor: input.actor, note: "Recorded by admin" });
  });
  return { approved, months, skipped };
}
