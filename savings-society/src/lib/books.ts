import type { EntryType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { monthKey, monthLabel } from "@/lib/months";
import { ServiceError } from "@/lib/errors";

/**
 * The society's books. Every taka that moves is a LedgerEntry naming the
 * account it moved through; every balance is a sum of entries. Costs and
 * profits are also split into per-member Allocations on the day they happen.
 * Nothing is deleted: a correction is a reversing entry (BR-11).
 */
export type Db = Prisma.TransactionClient | typeof prisma;

/** BR-15: entries dated in a closed month can't be added. */
export async function assertOpenMonth(db: Db, date: Date): Promise<void> {
  const month = monthKey(date);
  if (await db.monthClose.findUnique({ where: { month } })) {
    throw new ServiceError(`${monthLabel(month, "long")} is closed. Date the entry in an open month (corrections go in as new entries).`);
  }
}

export type EntryInput = {
  date: Date;
  type: EntryType;
  amount: number; // whole taka, + in / − out
  accountId: string;
  sourceType: string;
  sourceId: string;
  memberId?: string | null;
  note?: string | null;
  createdBy?: string | null;
  transferGroup?: string | null;
};

export async function post(db: Db, e: EntryInput) {
  if (!Number.isInteger(e.amount)) throw new Error(`Ledger amounts are whole taka (got ${e.amount})`);
  await assertOpenMonth(db, e.date);
  return db.ledgerEntry.create({ data: { ...e, memberId: e.memberId ?? null } });
}

/** Moves money between two society accounts. Total cash doesn't change (BR-14). */
export async function postTransfer(
  db: Db,
  t: { fromId: string; toId: string; amount: number; date: Date; sourceType: string; sourceId: string; note?: string | null; createdBy?: string | null }
) {
  if (t.fromId === t.toId) throw new ServiceError("Choose two different accounts.");
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new ServiceError("Enter the amount to move.");
  const group = `${t.sourceType}:${t.sourceId}`;
  const base = { date: t.date, type: "TRANSFER" as const, sourceType: t.sourceType, sourceId: t.sourceId, note: t.note, createdBy: t.createdBy, transferGroup: group };
  await post(db, { ...base, accountId: t.fromId, amount: -t.amount });
  await post(db, { ...base, accountId: t.toId, amount: t.amount });
}

/**
 * Reverses everything a source record put on the books: one opposite entry for
 * each of its entries, and the opposite of each member's share. Dated today.
 */
export async function reverseSource(db: Db, sourceType: string, sourceId: string, opts: { note: string; createdBy?: string | null; date?: Date }) {
  const date = opts.date ?? new Date();
  const entries = await db.ledgerEntry.findMany({ where: { sourceType, sourceId, reversesId: null, reversedBy: null } });
  for (const e of entries) {
    await assertOpenMonth(db, date);
    await db.ledgerEntry.create({
      data: {
        date,
        type: e.type,
        amount: -e.amount,
        accountId: e.accountId,
        memberId: e.memberId,
        sourceType,
        sourceId,
        transferGroup: e.transferGroup,
        note: `Reversal: ${opts.note}`,
        reversesId: e.id,
        createdBy: opts.createdBy ?? null,
      },
    });
  }
  const allocations = await db.allocation.findMany({ where: { sourceType, sourceId } });
  const net = new Map<string, number>();
  for (const a of allocations) net.set(a.memberId, (net.get(a.memberId) ?? 0) + a.paisa);
  for (const [memberId, paisa] of net) {
    if (paisa !== 0) await db.allocation.create({ data: { sourceType, sourceId, memberId, paisa: -paisa, date, frozen: true } });
  }
}

type Eligible = { joinMonth: string; joiningRule: string; caughtUpAt: Date | null; createdAt: Date; exitedAt: Date | null; deceasedOn: Date | null };

/**
 * BR-05 / BR-08: who shares a cost or profit dated `date`. Members whose status
 * is Active, Behind or Exiting on that day: started by then, not yet left.
 * "Start fresh" members count from their first month; "pay back" members from
 * the day they were added, and for everything once their back months are paid.
 */
export function isEligible(m: Eligible, date: Date): boolean {
  const month = monthKey(date);
  const started = m.joiningRule === "PAY_BACK" ? !!m.caughtUpAt || monthKey(m.createdAt) <= month : m.joinMonth <= month;
  if (!started) return false;
  if (m.exitedAt && m.exitedAt <= date) return false;
  if (m.deceasedOn && m.deceasedOn < date) return false;
  return true;
}

export async function eligibleMemberIds(db: Db, date: Date): Promise<string[]> {
  const members = await db.user.findMany({
    where: { role: "MEMBER" },
    select: { id: true, joinMonth: true, joiningRule: true, caughtUpAt: true, createdAt: true, exitedAt: true, deceasedOn: true },
    orderBy: { createdAt: "asc" },
  });
  return members.filter((m) => isEligible(m, date)).map((m) => m.id);
}

/** BR-10: equal shares in paisa, truncated; the remainder stays in the society fund. */
export function splitPaisa(totalPaisa: number, count: number): number {
  if (count <= 0) return 0;
  return Math.trunc(totalPaisa / count);
}

/** Splits a cost (negative) or profit (positive) among members eligible on its date. */
export async function allocate(db: Db, a: { sourceType: string; sourceId: string; taka: number; date: Date }) {
  const ids = await eligibleMemberIds(db, a.date);
  const each = splitPaisa(a.taka * 100, ids.length);
  if (each === 0) return;
  await db.allocation.createMany({ data: ids.map((memberId) => ({ sourceType: a.sourceType, sourceId: a.sourceId, memberId, paisa: each, date: a.date })) });
}

/**
 * Re-splits one cost or profit among the members eligible on its date (used
 * when a pay-back member becomes a founding member). Frozen shares — taken out
 * by members whose settlement is approved — stay as they are.
 */
export async function rebalance(db: Db, a: { sourceType: string; sourceId: string; taka: number; date: Date }) {
  const existing = await db.allocation.findMany({ where: { sourceType: a.sourceType, sourceId: a.sourceId } });
  const frozen = existing.filter((x) => x.frozen);
  const frozenIds = new Set(frozen.map((x) => x.memberId));
  const free = a.taka * 100 - frozen.reduce((s, x) => s + x.paisa, 0);
  const ids = (await eligibleMemberIds(db, a.date)).filter((id) => !frozenIds.has(id));
  await db.allocation.deleteMany({ where: { sourceType: a.sourceType, sourceId: a.sourceId, frozen: false } });
  const each = splitPaisa(free, ids.length);
  if (each !== 0) await db.allocation.createMany({ data: ids.map((memberId) => ({ sourceType: a.sourceType, sourceId: a.sourceId, memberId, paisa: each, date: a.date })) });
}

/** Every cost and profit still on the books, as (source, amount, date) — for re-splitting. */
export async function shareSources(db: Db) {
  const [expenses, incomes, closed] = await Promise.all([
    db.expense.findMany({ where: { reversedAt: null } }),
    db.income.findMany({ where: { reversedAt: null } }),
    db.investment.findMany({ where: { status: "CLOSED", closedAt: { not: null } } }),
  ]);
  return [
    ...expenses.map((e) => ({ sourceType: "expense", sourceId: e.id, taka: -e.amount, date: e.date })),
    ...incomes.map((i) => ({ sourceType: "income", sourceId: i.id, taka: i.amount, date: i.date })),
    ...closed.map((i) => ({ sourceType: "gain", sourceId: i.id, taka: (i.returnedAmount ?? i.amount) - i.amount, date: i.closedAt! })),
  ];
}

/** Pay-back members become founding members once every back month is approved (BR-08). */
export async function checkCaughtUp(db: Db, memberId: string, months: string[]): Promise<boolean> {
  const m = await db.user.findUnique({ where: { id: memberId } });
  if (!m || m.joiningRule !== "PAY_BACK" || m.caughtUpAt) return false;
  const backMonths = months.filter((x) => x < monthKey(m.createdAt));
  if (backMonths.length === 0) return false;
  const paid = await db.payment.count({ where: { memberId, status: "APPROVED", forMonth: { in: backMonths } } });
  if (paid < backMonths.length) return false;
  await db.user.update({ where: { id: memberId }, data: { caughtUpAt: new Date() } });
  for (const s of await shareSources(db)) if (monthKey(s.date) < monthKey(m.createdAt)) await rebalance(db, s);
  return true;
}

/** Cash held across all accounts (or one) at the end of a moment: opening balances plus every entry. */
export async function cashAt(db: Db, end?: Date, accountId?: string): Promise<number> {
  const [entries, accounts] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { ...(end ? { date: { lte: end } } : {}), ...(accountId ? { accountId } : {}) }, _sum: { amount: true } }),
    db.account.aggregate({ where: accountId ? { id: accountId } : {}, _sum: { openingBalance: true } }),
  ]);
  return (entries._sum.amount ?? 0) + (accounts._sum.openingBalance ?? 0);
}

/** Each account's balance (all accounts, open ones first). */
export async function accountBalances(db: Db = prisma, end?: Date) {
  const [accounts, sums] = await Promise.all([
    db.account.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] }),
    db.ledgerEntry.groupBy({ by: ["accountId"], where: end ? { date: { lte: end } } : {}, _sum: { amount: true } }),
  ]);
  const by = new Map(sums.map((s) => [s.accountId, s._sum.amount ?? 0]));
  return accounts.map((a) => ({ ...a, balance: a.openingBalance + (by.get(a.id) ?? 0) }));
}

/** The account to use when none is chosen: the first open bank account, else any open account. */
export async function defaultAccountId(db: Db): Promise<string> {
  const a =
    (await db.account.findFirst({ where: { active: true, type: "BANK" }, orderBy: { createdAt: "asc" } })) ??
    (await db.account.findFirst({ where: { active: true, type: { not: "FDR" } }, orderBy: { createdAt: "asc" } }));
  if (!a) throw new ServiceError("Add a society account first (Settings → Society accounts).");
  return a.id;
}

export async function accountOrDefault(db: Db, accountId: string | null | undefined): Promise<string> {
  if (accountId) {
    const a = await db.account.findUnique({ where: { id: accountId } });
    if (!a || !a.active) throw new ServiceError("Choose an open society account.");
    return a.id;
  }
  return defaultAccountId(db);
}

/** Open accounts money can move through day to day (FDRs only through transfers). */
export async function openAccounts(db: Db = prisma, opts: { includeFdr?: boolean } = {}) {
  return db.account.findMany({ where: { active: true, ...(opts.includeFdr ? {} : { type: { not: "FDR" } }) }, orderBy: { createdAt: "asc" } });
}
