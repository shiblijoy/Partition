"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveMember } from "@/lib/auth-guard";
import { attempt, changed, text } from "@/lib/actions";
import { memberPosition } from "@/lib/society";
import { adminIds, queueForAll } from "@/lib/notify";
import { audit } from "@/lib/audit";
import type { FormState } from "@/components/ActionForm";

/** FR-WD-01..02: full exit or partial withdrawal, with where to send the money. */
export async function requestWithdrawal(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const viewer = await requireActiveMember();
    const kind = formData.get("kind") === "PARTIAL" ? "PARTIAL" : "FULL";
    const payTo = text(formData, "payTo");
    const reason = text(formData, "reason");
    const amount = Math.round(Number(formData.get("amount")));
    if (!payTo) return { error: "Tell the admin where to send the money." };
    const open = await prisma.withdrawal.count({ where: { memberId: viewer.userId, status: { in: ["PENDING", "APPROVED"] } } });
    if (open > 0) return { error: "You already have a request open." };
    if (kind === "PARTIAL") {
      const position = await memberPosition(viewer.userId);
      if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter how much you want to take out." };
      if (amount > position.net) return { error: "That's more than your current net value." };
    }
    const w = await prisma.withdrawal.create({ data: { memberId: viewer.userId, kind, payTo, reason, amount: kind === "PARTIAL" ? amount : null } });
    await queueForAll(prisma, await adminIds(), { kind: "withdrawal_request", title: "Withdrawal request", body: `${viewer.name} asked for a ${kind === "FULL" ? "full exit" : "partial withdrawal"}.`, url: `/admin/withdrawals/${w.id}` });
    await audit(viewer.userId, "withdrawal.requested", `${viewer.name} requested a ${kind.toLowerCase()} withdrawal`, { entity: `withdrawal:${w.id}` });
    changed();
    return { ok: "Request sent." };
  });
}

/** FR-WD-03: a member can cancel until the admin approves. */
export async function cancelWithdrawal(id: string): Promise<void> {
  const viewer = await requireActiveMember();
  const { count } = await prisma.withdrawal.updateMany({ where: { id, memberId: viewer.userId, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (count) await audit(viewer.userId, "withdrawal.cancelled", `${viewer.name} cancelled their withdrawal request`, { entity: `withdrawal:${id}` });
  changed();
}
