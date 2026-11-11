import type { AccountType, ExpenseCategory, IncomeKind } from "@prisma/client";
import { accountOrDefault, allocate, assertOpenMonth, cashAt, eligibleMemberIds, post, postTransfer, reverseSource, splitPaisa, type Db } from "@/lib/books";
import { audit } from "@/lib/audit";
import { ServiceError } from "@/lib/errors";
import { money, type Settings } from "@/lib/settings";
import { inTx, type Actor } from "@/lib/services/payments";

function wholeTaka(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new ServiceError(`${what} must be a positive amount.`);
  return Math.round(n);
}

/** FR-EXP-02: what an expense adds to each member's cost share, before it is saved. */
export async function costPerMemberPreview(db: Db, amount: number, date: Date) {
  const n = (await eligibleMemberIds(db, date)).length;
  return { members: n, paisa: splitPaisa(Math.round(amount) * 100, n) };
}

/** FR-EXP-01/03: an expense is a ledger entry plus one share per member active on its date. */
type ExpenseInput = { date: Date; category: ExpenseCategory; amount: number; description: string; receiptPath: string | null; accountId?: string | null; actor: Actor };

export async function addExpense(settings: Settings, e: ExpenseInput) {
  return inTx((tx) => addExpenseIn(tx, settings, e));
}

export async function addExpenseIn(db: Db, settings: Settings, e: ExpenseInput) {
  const amount = wholeTaka(e.amount, "The expense");
  if (!e.description.trim()) throw new ServiceError("Describe what the money was spent on.");
  {
    const tx = db;
    await assertOpenMonth(tx, e.date);
    const accountId = await accountOrDefault(tx, e.accountId);
    const row = await tx.expense.create({
      data: { date: e.date, category: e.category, amount, description: e.description, receiptPath: e.receiptPath, accountId, createdById: e.actor.id },
    });
    await post(tx, { date: e.date, type: "EXPENSE", amount: -amount, accountId, sourceType: "expense", sourceId: row.id, note: e.description, createdBy: e.actor.name });
    await allocate(tx, { sourceType: "expense", sourceId: row.id, taka: -amount, date: e.date });
    await audit(e.actor.id, "expense.added", `${e.actor.name} recorded a ${money(amount, settings.currencySymbol)} expense: ${e.description}`, { db: tx, entity: `expense:${row.id}`, after: row });
    return row;
  }
}

/** BR-11: an expense recorded by mistake is reversed (dated today), never deleted. */
export async function reverseExpense(settings: Settings, id: string, reason: string, actor: Actor) {
  if (!reason.trim()) throw new ServiceError("Give the reason for reversing it.");
  return inTx(async (tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e || e.reversedAt) throw new ServiceError("This expense has already been reversed.");
    await reverseSource(tx, "expense", id, { note: reason, createdBy: actor.name });
    await tx.expense.update({ where: { id }, data: { reversedAt: new Date(), reversalReason: reason } });
    await audit(actor.id, "expense.reversed", `${actor.name} reversed the expense “${e.description}” (${money(e.amount, settings.currencySymbol)}): ${reason}`, { db: tx, entity: `expense:${id}`, before: { reversed: false }, after: { reversed: true, reason } });
  });
}

/** FR-INC-01/03: other income goes into an account and is shared like investment profit (BR-12). */
type IncomeInput = { date: Date; kind: IncomeKind; amount: number; description: string; filePath: string | null; accountId?: string | null; investmentId?: string | null; actor: Actor };

export async function addIncome(settings: Settings, i: IncomeInput) {
  return inTx((tx) => addIncomeIn(tx, settings, i));
}

export async function addIncomeIn(db: Db, settings: Settings, i: IncomeInput) {
  const amount = wholeTaka(i.amount, "The income");
  if (!i.description.trim()) throw new ServiceError("Add a short description.");
  {
    const tx = db;
    await assertOpenMonth(tx, i.date);
    const accountId = await accountOrDefault(tx, i.accountId);
    const row = await tx.income.create({
      data: { date: i.date, kind: i.kind, amount, description: i.description, filePath: i.filePath, accountId, investmentId: i.investmentId ?? null },
    });
    await post(tx, { date: i.date, type: "INCOME", amount, accountId, sourceType: "income", sourceId: row.id, note: i.description, createdBy: i.actor.name });
    await allocate(tx, { sourceType: "income", sourceId: row.id, taka: amount, date: i.date });
    await audit(i.actor.id, "income.added", `${i.actor.name} recorded ${money(amount, settings.currencySymbol)} income: ${i.description}`, { db: tx, entity: `income:${row.id}`, after: row });
    return row;
  }
}

export async function reverseIncome(settings: Settings, id: string, reason: string, actor: Actor) {
  if (!reason.trim()) throw new ServiceError("Give the reason for reversing it.");
  return inTx(async (tx) => {
    const i = await tx.income.findUnique({ where: { id } });
    if (!i || i.reversedAt) throw new ServiceError("This income has already been reversed.");
    await reverseSource(tx, "income", id, { note: reason, createdBy: actor.name });
    await tx.income.update({ where: { id }, data: { reversedAt: new Date(), reversalReason: reason } });
    await audit(actor.id, "income.reversed", `${actor.name} reversed the income “${i.description}” (${money(i.amount, settings.currencySymbol)}): ${reason}`, { db: tx, entity: `income:${id}` });
  });
}

/** FR-REC-01: a society account. Only the last 4 digits of its number are kept. */
export async function addAccount(a: { name: string; type: AccountType; last4: string | null; openingBalance: number; memberDetails?: string | null; actor: Actor }) {
  if (!a.name.trim()) throw new ServiceError("Name the account.");
  if (a.last4 && !/^\d{4}$/.test(a.last4)) throw new ServiceError("Enter only the last 4 digits of the account number.");
  if (!Number.isInteger(a.openingBalance) || a.openingBalance < 0) throw new ServiceError("Opening balance must be a whole amount (0 if new).");
  return inTx(async (tx) => {
    const row = await tx.account.create({ data: { name: a.name.trim(), type: a.type, last4: a.last4, openingBalance: a.openingBalance, memberDetails: a.type === "BANK" ? a.memberDetails?.trim() || null : null } });
    await audit(a.actor.id, "account.added", `${a.actor.name} added the account ${row.name}`, { db: tx, entity: `account:${row.id}`, after: row });
    return row;
  });
}

/** BR-14: moving money between society accounts (e.g. bKash to bank) changes no total. */
export async function transfer(t: { fromId: string; toId: string; amount: number; date: Date; note: string | null; actor: Actor }) {
  const amount = wholeTaka(t.amount, "The transfer");
  return inTx(async (tx) => {
    const available = await cashAt(tx, undefined, t.fromId);
    if (amount > available) throw new ServiceError("That account doesn't hold that much.");
    const id = `t${Date.now().toString(36)}`;
    await postTransfer(tx, { fromId: t.fromId, toId: t.toId, amount, date: t.date, sourceType: "transfer", sourceId: id, note: t.note, createdBy: t.actor.name });
    await audit(t.actor.id, "account.transfer", `${t.actor.name} moved ${amount} between society accounts${t.note ? `: ${t.note}` : ""}`, { db: tx, entity: `transfer:${id}` });
  });
}

/** FR-INC-04: opening an FDR is a transfer from an account into a new FDR account, not an expense. */
export async function openFdr(f: { fromId: string; name: string; amount: number; rate: number | null; openedOn: Date; maturesOn: Date; actor: Actor }) {
  const amount = wholeTaka(f.amount, "The FDR");
  if (!f.name.trim()) throw new ServiceError("Enter the bank and term.");
  if (f.maturesOn <= f.openedOn) throw new ServiceError("Maturity must be after the opening date.");
  return inTx(async (tx) => {
    if (amount > (await cashAt(tx, undefined, f.fromId))) throw new ServiceError("That account doesn't hold that much.");
    const fdr = await tx.account.create({ data: { name: f.name.trim(), type: "FDR", rate: f.rate, openedOn: f.openedOn, maturesOn: f.maturesOn } });
    await postTransfer(tx, { fromId: f.fromId, toId: fdr.id, amount, date: f.openedOn, sourceType: "fdr", sourceId: fdr.id, note: `FDR opened: ${fdr.name}`, createdBy: f.actor.name });
    await audit(f.actor.id, "fdr.opened", `${f.actor.name} opened the FDR ${fdr.name}: ${amount}, matures ${f.maturesOn.toISOString().slice(0, 10)}`, { db: tx, entity: `account:${fdr.id}` });
    return fdr;
  });
}

/** At maturity the FDR's balance moves back to an account. Its profit is recorded separately as income. */
export async function closeFdr(f: { fdrId: string; toId: string; date: Date; actor: Actor }) {
  return inTx(async (tx) => {
    const fdr = await tx.account.findUnique({ where: { id: f.fdrId } });
    if (!fdr || fdr.type !== "FDR" || !fdr.active) throw new ServiceError("This FDR is already closed.");
    const balance = await cashAt(tx, undefined, fdr.id);
    if (balance > 0) await postTransfer(tx, { fromId: fdr.id, toId: f.toId, amount: balance, date: f.date, sourceType: "fdr", sourceId: `${fdr.id}:close`, note: `FDR closed: ${fdr.name}`, createdBy: f.actor.name });
    await tx.account.update({ where: { id: fdr.id }, data: { active: false, closedOn: f.date } });
    await audit(f.actor.id, "fdr.closed", `${f.actor.name} closed the FDR ${fdr.name} (${balance} back)`, { db: tx, entity: `account:${fdr.id}` });
  });
}
