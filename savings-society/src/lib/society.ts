import { prisma } from "@/lib/prisma";
import { memberLedger, type Ledger } from "@/lib/ledger";
import type { Settings } from "@/lib/settings";

export type MemberWithLedger = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  joinMonth: string;
  active: boolean;
  pendingCount: number;
  ledger: Ledger;
};

/** Every member with their approved total worked into a ledger. */
export async function membersWithLedgers(settings: Settings, opts: { includeInactive?: boolean } = {}) {
  const [members, approved, pending] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MEMBER", ...(opts.includeInactive ? {} : { active: true }) },
      orderBy: { name: "asc" },
    }),
    prisma.payment.groupBy({ by: ["memberId"], where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ["memberId"], where: { status: "PENDING" }, _count: { _all: true } }),
  ]);
  const approvedBy = new Map(approved.map((row) => [row.memberId, row._sum.amount ?? 0]));
  const pendingBy = new Map(pending.map((row) => [row.memberId, row._count._all]));

  return members.map<MemberWithLedger>((m) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    email: m.email,
    joinMonth: m.joinMonth,
    active: m.active,
    pendingCount: pendingBy.get(m.id) ?? 0,
    ledger: memberLedger(m, approvedBy.get(m.id) ?? 0, settings),
  }));
}

export async function approvedTotalFor(memberId: string): Promise<number> {
  const agg = await prisma.payment.aggregate({
    where: { memberId, status: "APPROVED" },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/**
 * The society's money position. Costs are shared equally by active members,
 * so each member's share of the fund is what they deposited minus their share
 * of costs.
 */
export async function fundSummary() {
  const [collected, spent, pending, activeMembers] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.user.count({ where: { role: "MEMBER", active: true } }),
  ]);
  const totalCollected = collected._sum.amount ?? 0;
  const totalExpenses = spent._sum.amount ?? 0;
  return {
    totalCollected,
    totalExpenses,
    balance: totalCollected - totalExpenses,
    pendingAmount: pending._sum.amount ?? 0,
    pendingCount: pending._count._all,
    activeMembers,
    expenseSharePerMember: activeMembers > 0 ? totalExpenses / activeMembers : 0,
  };
}
