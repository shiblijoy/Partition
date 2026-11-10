"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { attempt, changed, text } from "@/lib/actions";
import { adminIds, queueForAll } from "@/lib/notify";
import type { FormState } from "@/components/ActionForm";

/**
 * FR-RCP-03: the member confirms the money arrived. If they asked for their
 * account to be deleted, their personal details are erased now (financial
 * records are kept, §5). Otherwise a member who left keeps read-only access
 * for 12 months (FR-MEM-07).
 */
export async function confirmPayout(id: string): Promise<void> {
  const viewer = await requireMember();
  const w = await prisma.withdrawal.findFirst({ where: { id, memberId: viewer.userId, status: "PAID", memberConfirmedAt: null } });
  if (!w) return;
  await prisma.withdrawal.update({ where: { id }, data: { memberConfirmedAt: new Date(), problemNote: null } });
  await audit(viewer.userId, "payout.confirmed", `${viewer.name} confirmed receiving the payout`, { entity: `withdrawal:${id}` });
  if (w.kind === "FULL" && w.eraseData) {
    await prisma.user.update({
      where: { id: viewer.userId },
      data: { active: false, nid: null, dateOfBirth: null, address: null, nomineeName: null, nomineeRelation: null, nomineePhone: null, nomineeNid: null, email: null },
    });
    await audit(viewer.userId, "member.erased", `${viewer.name}'s personal details were erased after their final payout (account deletion request)`);
    changed();
    redirect("/login");
  }
  changed();
}

export async function reportPayoutProblem(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const viewer = await requireMember();
    const note = text(formData, "problem");
    if (!note) return { error: "Describe the problem." };
    const { count } = await prisma.withdrawal.updateMany({ where: { id, memberId: viewer.userId, memberConfirmedAt: null }, data: { problemNote: note } });
    if (count) await queueForAll(prisma, await adminIds(), { kind: "payout_problem", title: "Payout problem reported", body: `${viewer.name}: ${note}`, url: `/admin/withdrawals/${id}` });
    changed();
    return { ok: "Sent to the admin." };
  });
}
