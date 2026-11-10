/**
 * One-off upgrade of a database made by the earlier version of the app
 * (run after `prisma migrate deploy`; deploy/update.sh does both):
 *   npx tsx prisma/upgrade.ts
 *
 * It turns what the old tables held into the new books: society accounts and
 * FDR accounts, one payment per month, receipts, month slots, ledger entries
 * for every past movement, each member's share of past costs and profits, and
 * encrypted personal details. Safe to run again: it does nothing once done.
 */
import { randomUUID } from "crypto";
import { PrismaClient, type AccountType } from "@prisma/client";
import { encrypt, encryptPii } from "../src/lib/crypto";
import { addMonths } from "../src/lib/months";
import { newVerifyCode } from "../src/lib/receipts";
import { isEligible, splitPaisa } from "../src/lib/books";

const prisma = new PrismaClient();

async function legacy<T>(sql: string): Promise<T[]> {
  try {
    return (await prisma.$queryRawUnsafe(sql)) as T[];
  } catch (err) {
    if (!String(err).includes("no such table")) throw err;
    return []; // table not there (fresh install, or already upgraded)
  }
}

function guessType(name: string): AccountType {
  const n = name.toLowerCase();
  if (/bkash|nagad|rocket|wallet/.test(n)) return "MOBILE_WALLET";
  if (/cash|hand|treasurer/.test(n)) return "CASH";
  return "BANK";
}

async function main() {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  if (!setting) return console.log("No settings yet: nothing to upgrade.");
  if (setting.dataVersion >= 2) return console.log("Already upgraded.");

  const [oldSetting] = await legacy<{ cashAccounts: string | null }>(`SELECT cashAccounts FROM _Legacy_Setting`);
  const oldFdrs = await legacy<{ id: string; bank: string; amount: number; rate: number | null; openedOn: number; maturesOn: number; status: string; closedOn: number | null }>(`SELECT id, bank, CAST(amount AS REAL) AS amount, CAST(rate AS REAL) AS rate, CAST(openedOn AS INTEGER) AS openedOn, CAST(maturesOn AS INTEGER) AS maturesOn, status, CAST(closedOn AS INTEGER) AS closedOn FROM _Legacy_Fdr`);
  const oldPayments = await legacy<{ id: string; monthsCount: number; receiptNo: string | null; verifyCode: string | null }>(`SELECT id, CAST(monthsCount AS INTEGER) AS monthsCount, receiptNo, verifyCode FROM _Legacy_Payment`);
  const oldWithdrawals = await legacy<{ id: string; receiptNo: string | null }>(`SELECT * FROM _Legacy_Withdrawal`);
  const oldIncome = await legacy<{ id: string; account: string | null }>(`SELECT * FROM _Legacy_Income`);

  await prisma.$transaction(
    async (tx) => {
      // 1. Society accounts from the old one-per-line list.
      const names = (oldSetting?.cashAccounts ?? "Bank account").split("\n").map((s) => s.trim()).filter(Boolean);
      const accounts: Array<{ id: string; type: AccountType }> = [];
      for (const name of names) {
        const last4 = name.match(/(\d{4})\D*$/)?.[1] ?? null;
        accounts.push(await tx.account.create({ data: { name: name.replace(/[•·\s]*X{2,}$/i, "").trim() || name, type: guessType(name), last4 } }));
      }
      const bank = accounts.find((a) => a.type === "BANK") ?? accounts[0];
      const byType = (t: AccountType) => accounts.find((a) => a.type === t) ?? bank;
      const accountFor = (method: string) => (method === "CASH" ? byType("CASH") : method === "BKASH" || method === "NAGAD" || method === "ROCKET" ? byType("MOBILE_WALLET") : bank);

      // 2. FDRs become FDR accounts; opening one was a transfer from the bank.
      for (const f of oldFdrs) {
        const fdr = await tx.account.create({
          data: { name: f.bank, type: "FDR", rate: f.rate, openedOn: new Date(Number(f.openedOn)), maturesOn: new Date(Number(f.maturesOn)), active: f.status === "OPEN", closedOn: f.closedOn ? new Date(Number(f.closedOn)) : null },
        });
        const amount = Math.round(f.amount);
        const base = { type: "TRANSFER" as const, sourceType: "fdr", sourceId: fdr.id, transferGroup: `fdr:${fdr.id}`, note: `FDR opened: ${f.bank}`, createdBy: "upgrade" };
        await tx.ledgerEntry.create({ data: { ...base, date: fdr.openedOn!, accountId: bank.id, amount: -amount } });
        await tx.ledgerEntry.create({ data: { ...base, date: fdr.openedOn!, accountId: fdr.id, amount } });
        if (f.status !== "OPEN" && f.closedOn) {
          const back = { ...base, sourceId: `${fdr.id}:close`, transferGroup: `fdr:${fdr.id}:close`, note: `FDR closed: ${f.bank}` };
          await tx.ledgerEntry.create({ data: { ...back, date: new Date(Number(f.closedOn)), accountId: fdr.id, amount: -amount } });
          await tx.ledgerEntry.create({ data: { ...back, date: new Date(Number(f.closedOn)), accountId: bank.id, amount } });
        }
      }

      // 3. Multi-month payments become one payment per month, linked by a batch.
      const legacyBy = new Map(oldPayments.map((p) => [p.id, p]));
      for (const old of oldPayments.filter((p) => p.monthsCount > 1)) {
        const p = await tx.payment.findUnique({ where: { id: old.id } });
        if (!p) continue;
        const batchId = randomUUID();
        const each = Math.floor(p.amount / old.monthsCount);
        await tx.payment.update({ where: { id: p.id }, data: { batchId, amount: p.amount - each * (old.monthsCount - 1) } });
        for (let i = 1; i < old.monthsCount; i++) {
          const { id: _id, ...rest } = p;
          void _id;
          await tx.payment.create({ data: { ...rest, batchId, forMonth: addMonths(p.forMonth, i), amount: each } });
        }
      }

      // 4. Receipts, month slots, the account money arrived in, and deposit entries.
      const payments = await tx.payment.findMany({ orderBy: [{ reviewedAt: "asc" }, { createdAt: "asc" }, { forMonth: "asc" }] });
      const counters = new Map<string, number>();
      const nextNo = (prefix: string, date: Date) => {
        const key = `${prefix}-${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}-`;
        const n = (counters.get(key) ?? 0) + 1;
        counters.set(key, n);
        return key + String(n).padStart(3, "0");
      };
      const used = new Set(oldPayments.map((p) => p.receiptNo).filter(Boolean));
      for (const p of payments) {
        if (p.status === "PENDING" || p.status === "APPROVED") {
          const clash = await tx.monthSlot.findUnique({ where: { memberId_month: { memberId: p.memberId, month: p.forMonth } } });
          if (clash) {
            console.warn(`Two payments for ${p.memberId} ${p.forMonth}: keeping the first, marking ${p.id} rejected.`);
            await tx.payment.update({ where: { id: p.id }, data: { status: "REJECTED", reviewNote: "Duplicate month found during upgrade" } });
            continue;
          }
          await tx.monthSlot.create({ data: { memberId: p.memberId, month: p.forMonth, paymentId: p.id } });
        }
        if (p.status !== "APPROVED") continue;
        const account = accountFor(p.method);
        const receivedOn = p.paidOn;
        await tx.payment.update({ where: { id: p.id }, data: { receivedOn, accountId: account.id } });
        await tx.ledgerEntry.create({ data: { date: receivedOn, type: "DEPOSIT", amount: p.amount, accountId: account.id, memberId: p.memberId, sourceType: "payment", sourceId: p.id, createdBy: "upgrade" } });
        const old = legacyBy.get(p.id);
        let receiptNo = old?.receiptNo ?? null;
        if (!receiptNo) do receiptNo = nextNo("SS", p.reviewedAt ?? p.createdAt); while (used.has(receiptNo));
        used.add(receiptNo);
        const reviewer = p.reviewedById ? await tx.user.findUnique({ where: { id: p.reviewedById } }) : null;
        await tx.receipt.create({ data: { receiptNo, kind: "DEPOSIT", paymentId: p.id, memberId: p.memberId, amount: p.amount, verifyCode: old?.verifyCode ?? newVerifyCode(), issuedAt: p.reviewedAt ?? p.createdAt, issuedBy: reviewer?.name ?? null } });
      }

      // 5. Expenses, income, investments and payouts on the ledger.
      const incomeAccount = new Map(oldIncome.map((i) => [i.id, i.account]));
      for (const e of await tx.expense.findMany()) {
        await tx.expense.update({ where: { id: e.id }, data: { accountId: bank.id } });
        await tx.ledgerEntry.create({ data: { date: e.date, type: "EXPENSE", amount: -e.amount, accountId: bank.id, sourceType: "expense", sourceId: e.id, note: e.description, createdBy: "upgrade" } });
      }
      const allAccounts = await tx.account.findMany();
      for (const i of await tx.income.findMany()) {
        const named = incomeAccount.get(i.id);
        const account = allAccounts.find((a) => named && (a.name === named || named.startsWith(a.name))) ?? bank;
        await tx.income.update({ where: { id: i.id }, data: { accountId: account.id } });
        await tx.ledgerEntry.create({ data: { date: i.date, type: "INCOME", amount: i.amount, accountId: account.id, sourceType: "income", sourceId: i.id, note: i.description, createdBy: "upgrade" } });
      }
      for (const inv of await tx.investment.findMany({ where: { status: { in: ["ACTIVE", "CLOSED"] } } })) {
        await tx.investment.update({ where: { id: inv.id }, data: { accountId: bank.id } });
        await tx.ledgerEntry.create({ data: { date: inv.startedAt ?? inv.createdAt, type: "INVEST_OUT", amount: -inv.amount, accountId: bank.id, sourceType: "investment", sourceId: inv.id, note: inv.name, createdBy: "upgrade" } });
        if (inv.status === "CLOSED" && (inv.returnedAmount ?? 0) > 0) {
          await tx.ledgerEntry.create({ data: { date: inv.closedAt ?? new Date(), type: "CAPITAL_BACK", amount: inv.returnedAmount!, accountId: bank.id, sourceType: "investment", sourceId: inv.id, note: inv.name, createdBy: "upgrade" } });
        }
        if (inv.currentValue != null) await tx.valuation.create({ data: { investmentId: inv.id, value: inv.currentValue, recordedBy: "upgrade" } });
      }
      const oldWd = new Map(oldWithdrawals.map((w) => [w.id, w.receiptNo]));
      for (const w of await tx.withdrawal.findMany({ where: { status: "PAID" } })) {
        await tx.withdrawal.update({ where: { id: w.id }, data: { accountId: bank.id } });
        await tx.ledgerEntry.create({ data: { date: w.paidAt ?? w.createdAt, type: "PAYOUT", amount: -(w.payable ?? 0), accountId: bank.id, memberId: w.memberId, sourceType: "withdrawal", sourceId: w.id, createdBy: "upgrade" } });
        await tx.receipt.create({ data: { receiptNo: oldWd.get(w.id) ?? nextNo("WD", w.paidAt ?? w.createdAt), kind: "PAYOUT", withdrawalId: w.id, memberId: w.memberId, amount: w.payable ?? 0, verifyCode: newVerifyCode(), issuedAt: w.paidAt ?? w.createdAt } });
      }

      // 6. Members: pay-back rule, deaths, encrypted personal details.
      for (const m of await tx.user.findMany()) {
        const data: Record<string, unknown> = encryptPii(m);
        // The old app didn't record the joining rule; everyone counts from their first month (FRESH).
        const death = m.role === "MEMBER" && !m.active ? await tx.withdrawal.findFirst({ where: { memberId: m.id, kind: "NOMINEE" } }) : null;
        const died = death?.reason?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
        if (died) data.deceasedOn = new Date(`${died}T12:00:00`);
        await tx.user.update({ where: { id: m.id }, data });
      }
      for (const r of await tx.memberRequest.findMany({ where: { changes: { not: null } } })) {
        if (!r.changes!.startsWith("enc:")) await tx.memberRequest.update({ where: { id: r.id }, data: { changes: encrypt(r.changes) } });
      }

      // 7. Each member's share of every past cost and profit, split among members active on its date.
      const members = await tx.user.findMany({ where: { role: "MEMBER" } });
      const sources = [
        ...(await tx.expense.findMany()).map((e) => ({ sourceType: "expense", sourceId: e.id, taka: -e.amount, date: e.date })),
        ...(await tx.income.findMany()).map((i) => ({ sourceType: "income", sourceId: i.id, taka: i.amount, date: i.date })),
        ...(await tx.investment.findMany({ where: { status: "CLOSED" } })).map((i) => ({ sourceType: "gain", sourceId: i.id, taka: (i.returnedAmount ?? i.amount) - i.amount, date: i.closedAt ?? new Date() })),
      ];
      for (const s of sources) {
        const ids = members.filter((m) => isEligible(m, s.date)).map((m) => m.id);
        const each = splitPaisa(s.taka * 100, ids.length);
        if (each) await tx.allocation.createMany({ data: ids.map((memberId) => ({ sourceType: s.sourceType, sourceId: s.sourceId, date: s.date, memberId, paisa: each })) });
      }
      // Members already settled took their share with them: freeze it.
      for (const w of await tx.withdrawal.findMany({ where: { status: { in: ["APPROVED", "PAID"] }, kind: { in: ["FULL", "NOMINEE"] } } })) {
        await tx.allocation.updateMany({ where: { memberId: w.memberId }, data: { frozen: true } });
      }

      await tx.setting.update({ where: { id: 1 }, data: { dataVersion: 2 } });
    },
    { timeout: 300_000 }
  );

  for (const t of ["_Legacy_Setting", "_Legacy_Fdr", "_Legacy_Payment", "_Legacy_Withdrawal", "_Legacy_Income"]) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}"`);
  }
  console.log("Upgrade complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
