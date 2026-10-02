"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import type { FormState } from "@/components/ActionForm";

/**
 * The member confirms the money arrived. For someone who has left, that's the
 * end: their login stops working, and if they asked for their account to be
 * deleted, their personal details are erased (payment records are kept).
 */
export async function confirmPayout(id: string): Promise<void> {
  const session = await requireMember();
  const w = await prisma.withdrawal.findFirst({ where: { id, memberId: session.userId, status: "PAID", memberConfirmedAt: null } });
  if (!w) return;
  await prisma.withdrawal.update({ where: { id }, data: { memberConfirmedAt: new Date(), problemNote: null } });
  if (w.kind === "FULL") {
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        active: false,
        ...(w.eraseData
          ? { nid: null, dateOfBirth: null, address: null, nomineeName: null, nomineeRelation: null, nomineePhone: null, nomineeNid: null, email: null }
          : {}),
      },
    });
    await audit(session.userId, "payout.confirmed", `${session.name} confirmed receiving the payout ${w.receiptNo ?? w.id}`);
    revalidatePath("/admin", "layout");
    redirect("/login");
  }
  revalidatePath(`/member/payouts/${id}`);
  revalidatePath("/admin", "layout");
}

export async function reportPayoutProblem(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireMember();
  const note = String(formData.get("problem") ?? "").trim();
  if (!note) return { error: "Describe the problem." };
  await prisma.withdrawal.updateMany({ where: { id, memberId: session.userId, memberConfirmedAt: null }, data: { problemNote: note } });
  revalidatePath(`/member/payouts/${id}`);
  revalidatePath("/admin", "layout");
  return { ok: "Sent to the admin." };
}
