"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";

/** Cast or change a vote while voting is open. Passing null withdraws it. */
export async function castVote(investmentId: string, choice: "YES" | "NO" | null): Promise<void> {
  const session = await requireMember();
  const proposal = await prisma.investment.findUnique({ where: { id: investmentId } });
  if (!proposal || proposal.status !== "PROPOSED") return;
  if (proposal.voteEndsAt && proposal.voteEndsAt < new Date()) return;

  if (choice === null) {
    await prisma.vote.deleteMany({ where: { investmentId, memberId: session.userId } });
  } else {
    await prisma.vote.upsert({
      where: { investmentId_memberId: { investmentId, memberId: session.userId } },
      create: { investmentId, memberId: session.userId, choice },
      update: { choice },
    });
  }
  revalidatePath("/member/invest");
  revalidatePath("/admin/investments");
}
