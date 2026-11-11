import { prisma } from "@/lib/prisma";
import { memberLedger, type Ledger } from "@/lib/ledger";
import { cashAt, type Db } from "@/lib/books";
import { paisaToTaka, type Settings } from "@/lib/settings";

/**
 * Who counts as a member for dues and for sharing new costs and profits. A
 * member who has been settled out keeps their login for a while, but stops
 * counting as soon as `exit` is set.
 */
export const CURRENT_MEMBER = { active: true, exit: null } as const;

export type MemberWithLedger = {
  id: string;
  memberNo: number | null;
  name: string;
  phone: string;
  email: string | null;
  avatarPath: string | null;
  joinMonth: string;
  joiningRule: string;
  active: boolean;
  exit: string | null;
  createdAt: Date;
  hasNominee: boolean;
  pendingCount: number;
  ledger: Ledger;
};

/** Every member with their approved months worked into a ledger. */
export async function membersWithLedgers(settings: Settings, opts: { includeInactive?: boolean } = {}) {
  const [members, approved, pending] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MEMBER", ...(opts.includeInactive ? {} : CURRENT_MEMBER) },
      orderBy: [{ memberNo: "asc" }, { name: "asc" }],
    }),
    prisma.payment.findMany({ where: { status: "APPROVED" }, select: { memberId: true, forMonth: true, amount: true } }),
    prisma.payment.findMany({ where: { status: "PENDING" }, select: { memberId: true, forMonth: true } }),
  ]);
  const approvedBy = new Map<string, Array<{ forMonth: string; amount: number }>>();
  for (const p of approved) approvedBy.set(p.memberId, [...(approvedBy.get(p.memberId) ?? []), p]);
  const pendingBy = new Map<string, string[]>();
  for (const p of pending) pendingBy.set(p.memberId, [...(pendingBy.get(p.memberId) ?? []), p.forMonth]);

  return members.map<MemberWithLedger>((m) => ({
    id: m.id,
    memberNo: m.memberNo,
    name: m.name,
    phone: m.phone,
    email: m.email,
    avatarPath: m.avatarPath,
    joinMonth: m.joinMonth,
    joiningRule: m.joiningRule,
    active: m.active,
    exit: m.exit,
    createdAt: m.createdAt,
    hasNominee: !!m.nomineeName,
    pendingCount: pendingBy.get(m.id)?.length ?? 0,
    ledger: memberLedger(m, approvedBy.get(m.id) ?? [], settings, { pending: pendingBy.get(m.id) }),
  }));
}

/** One member's ledger: approved and pending months. */
export async function ledgerFor(memberId: string, settings: Settings, asOf?: string) {
  const [member, approved, pending] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.payment.findMany({ where: { memberId, status: "APPROVED" }, select: { forMonth: true, amount: true } }),
    prisma.payment.findMany({ where: { memberId, status: "PENDING" }, select: { forMonth: true } }),
  ]);
  return memberLedger(member, approved, settings, { pending: pending.map((p) => p.forMonth), asOf });
}

export async function approvedTotalFor(memberId: string, db: Db = prisma): Promise<number> {
  const agg = await db.payment.aggregate({ where: { memberId, status: "APPROVED" }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

/**
 * The society's money position, all from the ledger:
 * Cash = deposits − expenses − invested + capital returned + income − payouts (+ opening balances).
 * Profit = income + gain (or loss) on investments that have been closed.
 * Estimated land/share gain is reported separately and only becomes profit once sold.
 */
export async function fundSummary(db: Db = prisma) {
  const [byType, opening, pending, current, investments, costs, profits] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ["type"], _sum: { amount: true } }),
    db.account.aggregate({ _sum: { openingBalance: true } }),
    db.payment.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
    db.user.findMany({ where: { role: "MEMBER", ...CURRENT_MEMBER }, select: { id: true } }),
    db.investment.findMany({ where: { status: { in: ["ACTIVE", "CLOSED"] } } }),
    db.allocation.groupBy({ by: ["memberId"], where: { sourceType: "expense" }, _sum: { paisa: true } }),
    db.allocation.groupBy({ by: ["memberId"], where: { sourceType: { in: ["income", "gain"] } }, _sum: { paisa: true } }),
  ]);
  const sum = (t: string) => byType.find((r) => r.type === t)?._sum.amount ?? 0;
  const totalCollected = sum("DEPOSIT");
  const totalExpenses = -sum("EXPENSE");
  const totalIncome = sum("INCOME");
  const paidOut = -sum("PAYOUT");
  const openingBalance = opening._sum.openingBalance ?? 0;
  const cash = openingBalance + byType.reduce((s, r) => s + (r._sum.amount ?? 0), 0);

  const active = investments.filter((i) => i.status === "ACTIVE");
  const closed = investments.filter((i) => i.status === "CLOSED");
  const invested = active.reduce((s, i) => s + i.amount, 0);
  const closedGain = closed.reduce((s, i) => s + ((i.returnedAmount ?? i.amount) - i.amount), 0);
  const unrealisedGain = active.filter((i) => i.currentValue != null).reduce((s, i) => s + ((i.currentValue ?? i.amount) - i.amount), 0);

  const ids = new Set(current.map((m) => m.id));
  const avg = (rows: Array<{ memberId: string; _sum: { paisa: number | null } }>) =>
    ids.size ? rows.filter((r) => ids.has(r.memberId)).reduce((s, r) => s + (r._sum.paisa ?? 0), 0) / ids.size / 100 : 0;

  return {
    totalCollected,
    totalExpenses,
    totalIncome,
    closedGain,
    totalProfit: totalIncome + closedGain,
    invested,
    activeInvestments: active.length,
    unrealisedGain,
    paidOut,
    openingBalance,
    cash,
    balance: cash + invested, // the fund, including what's invested
    pendingAmount: pending._sum.amount ?? 0,
    pendingCount: pending._count._all,
    activeMembers: ids.size,
    expenseSharePerMember: -avg(costs), // average of current members (each member's own share is in memberPosition)
    profitSharePerMember: avg(profits),
    landSharePerMember: ids.size ? Math.max(unrealisedGain, 0) / ids.size : 0,
  };
}

export type FundSummary = Awaited<ReturnType<typeof fundSummary>>;

/** One member's stake: what they'd get if they left today (whole taka; shares kept in paisa until then). */
export async function memberPosition(memberId: string, fund?: FundSummary, db: Db = prisma) {
  const f = fund ?? (await fundSummary(db));
  const [deposits, partial, cost, profit] = await Promise.all([
    approvedTotalFor(memberId, db),
    db.withdrawal.aggregate({ where: { memberId, status: "PAID", kind: "PARTIAL" }, _sum: { payable: true } }),
    db.allocation.aggregate({ where: { memberId, sourceType: "expense" }, _sum: { paisa: true } }),
    db.allocation.aggregate({ where: { memberId, sourceType: { in: ["income", "gain"] } }, _sum: { paisa: true } }),
  ]);
  const withdrawn = partial._sum.payable ?? 0;
  const costPaisa = -(cost._sum.paisa ?? 0);
  const profitPaisa = profit._sum.paisa ?? 0;
  const profitShare = paisaToTaka(profitPaisa);
  const costShare = paisaToTaka(costPaisa);
  return {
    deposits,
    withdrawn,
    profitShare,
    costShare,
    costPaisa,
    profitPaisa,
    landShare: Math.round(f.landSharePerMember),
    // Built from the rounded parts, so a settlement adds up on paper.
    net: deposits - withdrawn + profitShare - costShare,
    // What members are shown: profit is visible to admins and auditors only.
    afterCosts: deposits - withdrawn - costShare,
  };
}

export async function cashAsOf(end: Date, db: Db = prisma): Promise<number> {
  return cashAt(db, end);
}
