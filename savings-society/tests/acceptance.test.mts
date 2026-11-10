/**
 * The acceptance checks of §9.1, run against a fresh database through the same
 * services the app uses. Run with `npm test`.
 */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "dreamhive-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.STORAGE_DIR = path.join(dir, "storage");
process.env.AUTH_SECRET ??= "test-secret";
execSync("npx prisma migrate deploy", { cwd: path.join(import.meta.dirname, ".."), stdio: "ignore", env: process.env });

// Imported after DATABASE_URL is set, so the shared client uses the test database.
const { prisma } = await import("@/lib/prisma");
const { getSettings } = await import("@/lib/settings");
const pay = await import("@/lib/services/payments");
const books = await import("@/lib/services/books");
const inv = await import("@/lib/services/investments");
const wd = await import("@/lib/services/withdrawals");
const rec = await import("@/lib/services/reconcile");
const { fundSummary, memberPosition, ledgerFor } = await import("@/lib/society");
const { cashAt } = await import("@/lib/books");
const { encryptPii } = await import("@/lib/crypto");
const { addMonths, currentMonth, monthEnd } = await import("@/lib/months");

const now = currentMonth();
const start = addMonths(now, -9);
const day = (month: string, d: number) => new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, d, 12);
let admin: { id: string; name: string };
let admin2: { id: string; name: string };
let bank: string;
let wallet: string;
const members: string[] = [];

async function settings() {
  return getSettings();
}

before(async () => {
  await prisma.setting.create({ data: { id: 1, startMonth: start } });
  await prisma.monthlyRate.create({ data: { fromMonth: start, amount: 10000 } });
  bank = (await prisma.account.create({ data: { name: "Bank", type: "BANK", last4: "4821" } })).id;
  wallet = (await prisma.account.create({ data: { name: "bKash", type: "MOBILE_WALLET" } })).id;
  const a = await prisma.user.create({ data: { name: "Admin One", phone: "a1@x.y", email: "a1@x.y", passwordHash: "x", role: "ADMIN", joinMonth: start } });
  const b = await prisma.user.create({ data: { name: "Admin Two", phone: "a2@x.y", email: "a2@x.y", passwordHash: "x", role: "ADMIN", joinMonth: start } });
  admin = { id: a.id, name: a.name };
  admin2 = { id: b.id, name: b.name };
  for (let i = 0; i < 24; i++) {
    const m = await prisma.user.create({
      data: { name: `Member ${i + 1}`, phone: `0170000${String(i).padStart(4, "0")}`, passwordHash: "x", role: "MEMBER", joinMonth: start, createdAt: day(start, 1), ...encryptPii({ nomineeName: `Nominee ${i + 1}`, nomineePhone: "01800000000" }) },
    });
    members.push(m.id);
  }
});

after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test("a submitted payment is pending, changes no total, and appears in the queue", async () => {
  const s = await settings();
  const [p] = await pay.submitPayments(s, { memberId: members[0], months: [start], method: "BANK", reference: "TX1", paidOn: day(start, 3), proofPath: null, note: null });
  assert.equal(p.status, "PENDING");
  assert.equal((await fundSummary()).totalCollected, 0);
  assert.equal(await prisma.payment.count({ where: { status: "PENDING" } }), 1);
});

test("approving updates savings and fund, issues a receipt with a verify code; a second payment for that month is blocked", async () => {
  const s = await settings();
  const p = await prisma.payment.findFirstOrThrow({ where: { memberId: members[0], forMonth: start } });
  assert.equal(await pay.approvePayment(s, p.id, { receivedOn: day(start, 4), accountId: wallet, actor: admin }), 1);
  const r = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: p.id } });
  assert.match(r.receiptNo, /^SS-\d{4}-001$/);
  assert.ok(r.verifyCode);
  assert.equal((await fundSummary()).totalCollected, 10000);
  assert.equal(await cashAt(prisma, undefined, wallet), 10000);
  // Bank payments only: any other method is refused.
  await assert.rejects(pay.submitPayments(s, { memberId: members[0], months: [addMonths(start, 1)], method: "BKASH", reference: "BK1", paidOn: day(start, 5), proofPath: null, note: null }), /Only bank payments/);
  await assert.rejects(pay.submitPayments(s, { memberId: members[0], months: [start], method: "BANK", reference: "TX2", paidOn: day(start, 5), proofPath: null, note: null }), /already has a payment/);
});

test("a rejected payment shows its reason and the month can be resubmitted", async () => {
  const s = await settings();
  const [p] = await pay.submitPayments(s, { memberId: members[1], months: [start], method: "BANK", reference: "SLIP", paidOn: day(start, 3), proofPath: null, note: null });
  await pay.rejectPayment(s, p.id, "Not found in the account", admin);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).reviewNote, "Not found in the account");
  const [again] = await pay.submitPayments(s, { memberId: members[1], months: [start], method: "BANK", reference: "SLIP-2", paidOn: day(start, 6), proofPath: null, note: null });
  assert.equal(again.status, "PENDING");
});

test("FR-PAY-09: a repeated transaction ID is found", async () => {
  assert.equal((await pay.duplicateReference("TX1")).length, 1);
  assert.equal((await pay.duplicateReference("NEVER-USED")).length, 0);
});

test("one ৳30,000 submission for three months makes three linked payments; approving issues three receipts", async () => {
  const s = await settings();
  const months = [addMonths(start, 1), addMonths(start, 2), addMonths(start, 3)];
  const created = await pay.submitPayments(s, { memberId: members[0], months, method: "BANK", reference: "TX3M", paidOn: day(months[0], 3), proofPath: null, note: null });
  assert.equal(created.length, 3);
  assert.equal(new Set(created.map((p) => p.batchId)).size, 1);
  assert.equal(created.reduce((t, p) => t + p.amount, 0), 30000);
  assert.equal(await pay.approvePayment(s, created[0].id, { receivedOn: day(months[0], 4), accountId: bank, actor: admin }), 3);
  assert.equal(await prisma.receipt.count({ where: { paymentId: { in: created.map((p) => p.id) } } }), 3);
  const l = await ledgerFor(members[0], s, months[2]);
  assert.equal(l.statusFor(months[2]), "paid");
});

test("FR-APR-06: an approval made by mistake is reversed; the receipt is cancelled and the month is due again", async () => {
  const s = await settings();
  const p = await prisma.payment.findFirstOrThrow({ where: { memberId: members[0], forMonth: addMonths(start, 3) } });
  const before = (await fundSummary()).totalCollected;
  await pay.reversePayment(s, p.id, "Approved the wrong member", admin);
  assert.equal((await fundSummary()).totalCollected, before - 10000);
  assert.ok((await prisma.receipt.findUniqueOrThrow({ where: { paymentId: p.id } })).cancelledAt);
  assert.equal(await prisma.payment.count({ where: { id: p.id } }), 1, "nothing is deleted");
  const [again] = await pay.submitPayments(s, { memberId: members[0], months: [addMonths(start, 3)], method: "BANK", reference: "TX-FIX", paidOn: new Date(), proofPath: null, note: null });
  assert.equal(again.status, "PENDING");
});

test("a cash payment recorded by the admin is approved, marked, with a receipt; months already paid are skipped", async () => {
  const s = await settings();
  const r = await pay.recordForMember(s, { memberId: members[2], months: [start, addMonths(start, 1)], method: "BANK", reference: null, receivedOn: day(addMonths(start, 1), 10), proofPath: null, accountId: bank, actor: admin });
  assert.equal(r.approved, 2);
  const again = await pay.recordForMember(s, { memberId: members[2], months: [addMonths(start, 1), addMonths(start, 2)], method: "BANK", reference: null, receivedOn: day(addMonths(start, 2), 10), proofPath: null, accountId: bank, actor: admin });
  assert.deepEqual(again.skipped, [addMonths(start, 1)]);
  const p = await prisma.payment.findFirstOrThrow({ where: { memberId: members[2], forMonth: start }, include: { receipt: true } });
  assert.equal(p.recordedBy, admin.name);
  assert.ok(p.receipt);
});

test("a ৳18,450 expense split across 24 members is ৳769 each, and the remainder stays in the fund", async () => {
  const s = await settings();
  const e = await books.addExpense(s, { date: day(addMonths(start, 1), 20), category: "MEETING", amount: 18450, description: "Year meeting", receiptPath: null, accountId: bank, actor: admin });
  const shares = await prisma.allocation.findMany({ where: { sourceType: "expense", sourceId: e.id } });
  assert.equal(shares.length, 24);
  assert.ok(shares.every((a) => a.paisa === -76875));
  assert.equal((await memberPosition(members[5])).costShare, 769);
});

test("bank interest of ৳2,400 adds ৳100 to each member; a transfer to an FDR doesn't change total cash", async () => {
  const s = await settings();
  const before = (await memberPosition(members[5])).profitShare;
  await books.addIncome(s, { kind: "BANK_INTEREST", amount: 2400, date: day(addMonths(start, 2), 25), accountId: bank, description: "Interest", filePath: null, actor: admin });
  assert.equal((await memberPosition(members[5])).profitShare - before, 100);
  const cash = (await fundSummary()).cash;
  await books.openFdr({ fromId: bank, name: "FDR 6m", amount: 5000, rate: 9, openedOn: day(addMonths(start, 2), 26), maturesOn: day(addMonths(start, 8), 26), actor: admin });
  assert.equal((await fundSummary()).cash, cash);
});

test("a payout larger than cash available is blocked", async () => {
  const s = await settings();
  const w = await prisma.withdrawal.create({ data: { memberId: members[3], kind: "PARTIAL", amount: 50_00_000, payTo: "bKash" } });
  await assert.rejects(wd.approveWithdrawal(s, w.id, { landTiming: "ON_SALE", actor: admin }), /net value|Not enough cash/);
});

test("a ৳500 difference between actual and calculated balance blocks closing the month until it is explained", async () => {
  const s = await settings();
  const month = start;
  const end = monthEnd(month);
  const lines = await Promise.all((await prisma.account.findMany({ where: { createdAt: { lte: new Date() } } })).map(async (a) => ({ accountId: a.id, actual: await cashAt(prisma, end, a.id), note: null, fix: "none" as const, statementPath: null })));
  const withDiff = lines.map((l) => (l.accountId === wallet ? { ...l, actual: l.actual - 500 } : l));
  await assert.rejects(rec.closeMonth(s, month, withDiff, admin), /lower than the books/);
  await rec.closeMonth(s, month, withDiff.map((l) => (l.accountId === wallet ? { ...l, fix: "charge" as const } : l)), admin);
  assert.ok(await prisma.monthClose.findUnique({ where: { month } }));
  // BR-15: nothing can be added in a closed month.
  await assert.rejects(books.addExpense(s, { date: day(month, 15), category: "OTHER", amount: 10, description: "Late", receiptPath: null, accountId: bank, actor: admin }), /is closed/);
});

test("NFR-SEC-07: an investment above the limit needs two different admins", async () => {
  const s = await settings();
  await prisma.setting.update({ where: { id: 1 }, data: { dualApprovalLimit: 1000 } });
  const i = await prisma.investment.create({ data: { kind: "BUSINESS", name: "Shop", amount: 5000, status: "PASSED" } });
  const s2 = await settings();
  assert.equal(await inv.startInvestment(s2, i.id, { accountId: bank, date: new Date(), actor: admin }), "waiting");
  await assert.rejects(inv.startInvestment(s2, i.id, { accountId: bank, date: new Date(), actor: admin }), /different admin/);
  assert.equal(await inv.startInvestment(s2, i.id, { accountId: bank, date: new Date(), actor: admin2 }), "invested");
  await prisma.setting.update({ where: { id: 1 }, data: { dualApprovalLimit: null } });
  void s;
});

test("a deceased member's settlement is paid to the nominee and frozen on approval (BR-09, BR-13)", async () => {
  const s = await settings();
  const id = members[2];
  await prisma.user.update({ where: { id }, data: { active: false, deceasedOn: new Date() } });
  const w = await prisma.withdrawal.create({ data: { memberId: id, kind: "NOMINEE", exitAs: "DECEASED", payTo: "Nominee 3 · 01800000000" } });
  assert.equal(await wd.approveWithdrawal(s, w.id, { landTiming: "ON_SALE", actor: admin }), "approved");
  const approved = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
  const pos = await memberPosition(id);
  assert.equal(approved.payable, pos.deposits + pos.profitShare - pos.costShare);
  // Members are shown deposits after costs only; the profit share stays with admins and auditors.
  assert.equal(pos.afterCosts, pos.deposits - pos.withdrawn - pos.costShare);
  // Later costs don't change a frozen settlement.
  await books.addExpense(s, { date: new Date(), category: "OTHER", amount: 2400, description: "After", receiptPath: null, accountId: bank, actor: admin });
  assert.equal((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).payable, approved.payable);
  // That bank account doesn't hold enough yet: the app refuses until more money is in it.
  await assert.rejects(wd.recordPayout(s, w.id, { reference: "BK-1", paidAt: new Date(), accountId: bank, actor: admin }), /doesn't hold enough/);
  await pay.recordForMember(s, { memberId: members[6], months: [start, addMonths(start, 1), addMonths(start, 2), addMonths(start, 4)], method: "BANK", reference: "BIG", receivedOn: new Date(), proofPath: null, accountId: bank, actor: admin });
  await wd.recordPayout(s, w.id, { reference: "BK-1", paidAt: new Date(), accountId: bank, actor: admin });
  const paid = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id }, include: { receipt: true } });
  assert.match(paid.receipt!.receiptNo, /^WD-\d{4}-001$/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id } })).exit, "DECEASED");
});

test("the ledger balances: cash equals opening balances plus every entry, and transfers net to zero", async () => {
  const f = await fundSummary();
  const sum = (await prisma.ledgerEntry.aggregate({ _sum: { amount: true } }))._sum.amount ?? 0;
  assert.equal(f.cash, sum);
  assert.equal((await prisma.ledgerEntry.aggregate({ where: { type: "TRANSFER" }, _sum: { amount: true } }))._sum.amount, 0);
});
