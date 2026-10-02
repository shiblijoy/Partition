import { prisma } from "@/lib/prisma";
import { memberLedger, type Ledger } from "@/lib/ledger";
import type { Settings } from "@/lib/settings";

/**
 * Who counts as a member for dues and sharing profit and costs. A member who
 * has been settled out keeps their login (\`active\`) until they confirm the
 * payout, but stops counting as soon as \`exit\` is set.
 */
export const CURRENT_MEMBER = { active: true, exit: null } as const;

export type MemberWithLedger = {
  id: string;
  memberNo: number | null;
  name: string;
  phone: string;
  email: string | null;
  joinMonth: string;
  active: boolean;
  exit: string | null;
  createdAt: Date;
  pendingCount: number;
  ledger: Ledger;
};

/** Every member with their approved total worked into a ledger. */
export async function membersWithLedgers(settings: Settings, opts: { includeInactive?: boolean } = {}) {
  const [members, approved, pending] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MEMBER", ...(opts.includeInactive ? {} : CURRENT_MEMBER) },
      orderBy: [{ memberNo: "asc" }, { name: "asc" }],
    }),
    prisma.payment.groupBy({ by: ["memberId"], where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ["memberId"], where: { status: "PENDING" }, _count: { _all: true } }),
  ]);
  const approvedBy = new Map(approved.map((row) => [row.memberId, row._sum.amount ?? 0]));
  const pendingBy = new Map(pending.map((row) => [row.memberId, row._count._all]));

  return members.map<MemberWithLedger>((m) => ({
    id: m.id,
    memberNo: m.memberNo,
    name: m.name,
    phone: m.phone,
    email: m.email,
    joinMonth: m.joinMonth,
    active: m.active,
    exit: m.exit,
    createdAt: m.createdAt,
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
 * The society's money position.
 *
 * - Cash = approved deposits − costs + profit − money still invested − payouts.
 * - Profit = recorded income (bank interest, investment profit, …) plus the gain
 *   (or loss) on investments that have been closed.
 * - Profit and costs are shared equally by active members. A member who has
 *   left took their share with them (snapshotted on their settlement), so the
 *   remaining pool is split across whoever is still active.
 * - Estimated land/share gain is reported separately and only becomes profit
 *   once the asset is sold.
 */
export async function fundSummary() {
  const [collected, spent, pending, activeMembers, income, investments, settled, partials] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.user.count({ where: { role: "MEMBER", ...CURRENT_MEMBER } }),
    prisma.income.aggregate({ _sum: { amount: true } }),
    prisma.investment.findMany({ where: { status: { in: ["ACTIVE", "CLOSED"] } } }),
    prisma.withdrawal.findMany({ where: { status: "PAID", kind: { in: ["FULL", "NOMINEE"] } } }),
    prisma.withdrawal.aggregate({ where: { status: "PAID", kind: "PARTIAL" }, _sum: { payable: true } }),
  ]);

  const totalCollected = collected._sum.amount ?? 0;
  const totalExpenses = spent._sum.amount ?? 0;
  const recordedIncome = income._sum.amount ?? 0;

  const active = investments.filter((i) => i.status === "ACTIVE");
  const closed = investments.filter((i) => i.status === "CLOSED");
  const invested = active.reduce((s, i) => s + i.amount, 0);
  const closedGain = closed.reduce((s, i) => s + ((i.returnedAmount ?? i.amount) - i.amount), 0);
  const totalProfit = recordedIncome + closedGain;
  const unrealisedGain = active
    .filter((i) => i.currentValue != null)
    .reduce((s, i) => s + ((i.currentValue ?? i.amount) - i.amount), 0);

  const paidOutSettlements = settled.reduce((s, w) => s + (w.payable ?? 0), 0);
  const paidOutPartial = partials._sum.payable ?? 0;
  const profitTaken = settled.reduce((s, w) => s + (w.profitShare ?? 0), 0);
  const costTaken = settled.reduce((s, w) => s + (w.costShare ?? 0), 0);
  const landTaken = settled.filter((w) => w.landTiming === "NOW").reduce((s, w) => s + (w.landShare ?? 0), 0);

  const balance = totalCollected - totalExpenses + totalProfit - paidOutSettlements - paidOutPartial; // the fund, incl. what's invested
  const cash = balance - invested;
  const per = (n: number) => (activeMembers > 0 ? n / activeMembers : 0);

  return {
    totalCollected,
    totalExpenses,
    totalProfit,
    invested,
    activeInvestments: active.length,
    unrealisedGain,
    paidOut: paidOutSettlements + paidOutPartial,
    balance,
    cash,
    pendingAmount: pending._sum.amount ?? 0,
    pendingCount: pending._count._all,
    activeMembers,
    expenseSharePerMember: per(totalExpenses - costTaken),
    profitSharePerMember: per(totalProfit - profitTaken),
    landSharePerMember: per(unrealisedGain - landTaken),
  };
}

export type FundSummary = Awaited<ReturnType<typeof fundSummary>>;

/** One member's stake: what they'd get if they left today. */
export async function memberPosition(memberId: string, fund: FundSummary) {
  const [deposits, partial] = await Promise.all([
    approvedTotalFor(memberId),
    prisma.withdrawal.aggregate({ where: { memberId, status: "PAID", kind: "PARTIAL" }, _sum: { payable: true } }),
  ]);
  const withdrawn = partial._sum.payable ?? 0;
  const profitShare = fund.profitSharePerMember;
  const costShare = fund.expenseSharePerMember;
  return {
    deposits,
    withdrawn,
    profitShare,
    costShare,
    landShare: fund.landSharePerMember,
    net: deposits - withdrawn + profitShare - costShare,
  };
}

/**
 * Cash the books say the society held at the end of a day (deposits, costs,
 * income, investments and payouts dated up to then). Compared with the real
 * account statements when a month is closed. FDRs count as cash: they're the
 * society's own accounts.
 */
export async function cashAsOf(end: Date): Promise<number> {
  const [collected, spent, income, investments, payouts] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "APPROVED", paidOn: { lte: end } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { date: { lte: end } }, _sum: { amount: true } }),
    prisma.income.aggregate({ where: { date: { lte: end } }, _sum: { amount: true } }),
    prisma.investment.findMany({ where: { status: { in: ["ACTIVE", "CLOSED"] }, startedAt: { lte: end } } }),
    prisma.withdrawal.aggregate({ where: { status: "PAID", paidAt: { lte: end } }, _sum: { payable: true } }),
  ]);
  const invested = investments.reduce((s, i) => s + i.amount, 0);
  const returned = investments.filter((i) => i.status === "CLOSED" && i.closedAt && i.closedAt <= end).reduce((s, i) => s + (i.returnedAmount ?? 0), 0);
  return (
    (collected._sum.amount ?? 0) - (spent._sum.amount ?? 0) + (income._sum.amount ?? 0) - invested + returned - (payouts._sum.payable ?? 0)
  );
}
