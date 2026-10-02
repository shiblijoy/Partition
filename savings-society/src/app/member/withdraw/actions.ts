"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { fundSummary, memberPosition } from "@/lib/society";
import type { FormState } from "@/components/ActionForm";

export async function requestWithdrawal(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireMember();
  const kind = formData.get("kind") === "PARTIAL" ? "PARTIAL" : "FULL";
  const payTo = String(formData.get("payTo") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const amount = Number(formData.get("amount"));

  if (!payTo) return { error: "Tell the admin where to send the money." };
  const open = await prisma.withdrawal.count({ where: { memberId: session.userId, status: { in: ["PENDING", "APPROVED"] } } });
  if (open > 0) return { error: "You already have a request open." };

  if (kind === "PARTIAL") {
    const position = await memberPosition(session.userId, await fundSummary());
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter how much you want to take out." };
    if (amount > position.net) return { error: "That's more than your current net value." };
  }

  await prisma.withdrawal.create({
    data: { memberId: session.userId, kind, payTo, reason, amount: kind === "PARTIAL" ? amount : null },
  });
  revalidatePath("/member", "layout");
  revalidatePath("/admin", "layout");
  return { ok: "Request sent." };
}

/** A member can cancel until the admin approves. */
export async function cancelWithdrawal(id: string): Promise<void> {
  const session = await requireMember();
  await prisma.withdrawal.updateMany({ where: { id, memberId: session.userId, status: "PENDING" }, data: { status: "CANCELLED" } });
  revalidatePath("/member", "layout");
  revalidatePath("/admin", "layout");
}
