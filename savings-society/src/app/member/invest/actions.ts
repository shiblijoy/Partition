"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveMember } from "@/lib/auth-guard";
import { changed } from "@/lib/actions";

/** FR-INV-04: one vote per member per proposal; it can be changed until the deadline. Null withdraws it. */
export async function castVote(investmentId: string, choice: "YES" | "NO" | null): Promise<void> {
  const viewer = await requireActiveMember();
  const proposal = await prisma.investment.findUnique({ where: { id: investmentId } });
  if (!proposal || proposal.status !== "PROPOSED") return;
  if (proposal.voteEndsAt && proposal.voteEndsAt < new Date()) return;
  if (choice === null) {
    await prisma.vote.deleteMany({ where: { investmentId, memberId: viewer.userId } });
  } else {
    await prisma.vote.upsert({
      where: { investmentId_memberId: { investmentId, memberId: viewer.userId } },
      create: { investmentId, memberId: viewer.userId, choice },
      update: { choice },
    });
  }
  changed();
}
