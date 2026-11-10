"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { attempt, changed, dateField, text } from "@/lib/actions";
import { approvePayment as approve, rejectPayment as reject, reopenRejected, reversePayment } from "@/lib/services/payments";
import { ServiceError } from "@/lib/errors";
import type { FormState } from "@/components/ActionForm";

const actorOf = (v: { userId: string; name: string }) => ({ id: v.userId, name: v.name });

/** Approve from the queue (FR-APR-07): the date the money arrived and the account are still required (FR-APR-03). */
export async function quickApprove(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const n = await approve(await getSettings(), paymentId, { receivedOn: dateField(formData, "receivedOn"), accountId: text(formData, "accountId"), actor: actorOf(admin) });
    changed();
    return { ok: n ? `Approved · ${n} receipt${n > 1 ? "s" : ""} issued.` : "Already handled." };
  });
}

export async function rejectPayment(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await reject(await getSettings(), paymentId, text(formData, "reason") ?? "", actorOf(admin));
    changed();
    return { ok: "Rejected. The member sees your reason." };
  });
}

/** Review page: approve or reject, then on to the next proof in the queue. */
export async function decidePayment(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    const admin = await requireAdmin();
    const settings = await getSettings();
    const decision = String(formData.get("decision") ?? "");
    const message = text(formData, "message");
    if (decision === "approve") {
      if (formData.getAll("check").length < 3) throw new ServiceError("Tick the checks first: money received, amount matches and transaction ID matches.");
      await approve(settings, paymentId, { receivedOn: dateField(formData, "receivedOn"), accountId: text(formData, "accountId"), actor: actorOf(admin), note: message });
    } else if (decision === "reject") {
      if (!message) throw new ServiceError("Write a message to the member saying why it's rejected.");
      await reject(settings, paymentId, message, actorOf(admin));
    } else {
      throw new ServiceError("Choose approve or reject.");
    }
    changed();
  });
  if (result.error) return result;
  const next = await prisma.payment.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  redirect(next ? `/admin/payments/${next.id}` : "/admin/payments");
}

/** FR-APR-06: undo an approval by a reversing entry with a reason. */
export async function reverseApproval(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await reversePayment(await getSettings(), paymentId, text(formData, "reason") ?? "", actorOf(admin));
    changed();
    return { ok: "Reversed. The receipt is cancelled and the month is due again." };
  });
}

export async function undoRejection(paymentId: string): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await reopenRejected(paymentId, actorOf(admin));
    changed();
    return { ok: "Back in the approval queue." };
  });
}
