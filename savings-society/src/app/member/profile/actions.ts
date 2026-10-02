"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import type { FormState } from "@/components/ActionForm";

export async function requestDetailsChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireMember();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Say what should change." };
  await prisma.memberRequest.create({ data: { memberId: session.userId, message } });
  revalidatePath("/admin", "layout");
  return { ok: "Sent. The admin will update your details." };
}

/** Deleting an account means leaving the society: it's a full withdrawal that also erases personal details once paid. */
export async function requestAccountDeletion(): Promise<void> {
  const session = await requireMember();
  const open = await prisma.withdrawal.findFirst({ where: { memberId: session.userId, status: { in: ["PENDING", "APPROVED"] } } });
  const member = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (open) {
    await prisma.withdrawal.update({ where: { id: open.id }, data: { eraseData: true } });
  } else {
    await prisma.withdrawal.create({
      data: { memberId: session.userId, kind: "FULL", payTo: `bKash ${member.phone}`, reason: "Asked to delete their account", eraseData: true },
    });
  }
  revalidatePath("/member", "layout");
  revalidatePath("/admin", "layout");
}
