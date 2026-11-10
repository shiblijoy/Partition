import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, membersWithLedgers } from "@/lib/society";
import { openAccounts, eligibleMemberIds } from "@/lib/books";
import { rateFor } from "@/lib/rates";
import { currentMonth, monthKey, monthLabel, monthRange } from "@/lib/months";
import { dateInput, fmtDay } from "@/lib/format";
import { Card, Empty, PageHeader, StatCard, dangerLink, CATEGORY_LABELS } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ProofLink } from "@/components/ProofLink";
import { ExpenseForm } from "./ExpenseForm";
import { reverse } from "./actions";

export default async function ExpensesPage() {
  const viewer = await requireStaff();
  const settings = await getSettings();
  const [fund, members, expenses, closed, accounts, eligible] = await Promise.all([
    fundSummary(),
    membersWithLedgers(settings),
    prisma.expense.findMany({ orderBy: { date: "desc" }, include: { createdBy: { select: { name: true } } } }),
    prisma.monthClose.findMany({ select: { month: true } }),
    openAccounts(),
    eligibleMemberIds(prisma, new Date()),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const closedMonths = new Set(closed.map((c) => c.month));
  const now = currentMonth();
  const year = now.slice(0, 4);
  const start = `${year}-01` > settings.startMonth ? `${year}-01` : settings.startMonth;
  const months = monthRange(start, now);
  const target = members.length * settings.monthlyAmount;
  const bars = months.map((m) => {
    const paid = members.filter((x) => x.ledger.statusFor(m) === "paid").length;
    const owed = members.filter((x) => x.ledger.statusFor(m) !== "before-join").length;
    return { month: m, value: paid * rateFor(m, settings.rates), full: paid >= owed };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fund & expenses"
        subtitle={`${monthLabel(settings.startMonth)} – ${monthLabel(now)} · approved deposits only`}
        back={{ href: "/admin", label: "Dashboard" }}
        action={<Link href="/admin/investments" className="py-2.5 text-sm font-bold">Investments →</Link>}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Total deposits" value={$(fund.totalCollected)} />
        <StatCard label="Total expenses" value={`−\u00a0${$(fund.totalExpenses)}`} tone="bad" />
        <StatCard label="Fund balance" value={$(fund.balance)} hint={`incl. ${$(fund.totalProfit)} profit${fund.paidOut ? `, after ${$(fund.paidOut)} paid out` : ""}`} tone="brand" />
        <StatCard label="Cost share per member" value={$(fund.expenseSharePerMember)} hint={`Average of the ${fund.activeMembers} current members (split on each expense's date)`} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-6">
          <Card title="Expenses">
            {expenses.length === 0 ? (
              <Empty>No expenses recorded yet.</Empty>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-bold text-muted">
                      <th className="px-4 py-2.5 sm:px-2">Date</th>
                      <th className="px-2 py-2.5">Category</th>
                      <th className="px-2 py-2.5">Description</th>
                      <th className="px-2 py-2.5 text-right">Amount</th>
                      <th className="px-2 py-2.5">Receipt</th>
                      <th className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className={`border-b border-[#EFEDE6] ${e.reversedAt ? "text-muted" : ""}`}>
                        <td className="px-4 py-2.5 text-muted sm:px-2">{fmtDay(e.date)}</td>
                        <td className="px-2 py-2.5">{CATEGORY_LABELS[e.category]}</td>
                        <td className="px-2 py-2.5 font-semibold">{e.description}{e.createdBy && <span className="block text-xs font-normal text-muted">by {e.createdBy.name}</span>}{e.reversedAt && <span className="block text-xs font-normal text-bad">Reversed {fmtDay(e.reversedAt)}: {e.reversalReason}</span>}</td>
                        <td className={`px-2 py-2.5 text-right font-bold ${e.reversedAt ? "line-through" : ""}`}>{$(e.amount)}</td>
                        <td className="px-2 py-2.5">{e.receiptPath ? <ProofLink path={e.receiptPath} size={36} /> : <span className="text-xs text-muted">—</span>}</td>
                        <td className="px-2 py-2.5 text-right">
                          {e.reversedAt ? (
                            <span className="text-xs text-muted">Reversed</span>
                          ) : viewer.role === "ADMIN" ? (
                            <details className="text-left">
                              <summary className={`${dangerLink} cursor-pointer list-none`}>Reverse</summary>
                              <ActionForm action={reverse.bind(null, e.id)} submitLabel="Reverse expense" buttonClass={dangerLink} className="mt-1 flex flex-col gap-1">
                                <input name="reason" required aria-label="Reason" placeholder="Reason" className="h-9 w-40 rounded-lg border border-field px-2 text-[13px]" />
                                <span className="text-[11px] text-muted">{closedMonths.has(monthKey(e.date)) ? "Its month is closed: the reversal is dated today." : "A reversing entry, dated today."}</span>
                              </ActionForm>
                            </details>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-extrabold">
                      <td colSpan={3} className="px-4 py-3 text-right sm:px-2">Total</td>
                      <td className="px-2 py-3 text-right">{$(fund.totalExpenses)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card title="Monthly collection">
            <div className="flex h-40 items-end gap-2" role="img" aria-label="Deposits collected per month">
              {bars.map((b) => (
                <div key={b.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${monthLabel(b.month, "long")}: ${$(b.value)}`}>
                  <div
                    className={`w-full max-w-10 rounded-t-md ${b.full ? "bg-brand" : "bg-[#C98A3A]"}`}
                    style={{ height: `${target ? Math.max(2, Math.round((b.value / target) * 130)) : 2}px` }}
                  />
                  <div className="text-xs font-semibold text-muted">{monthLabel(b.month).split(" ")[0]}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted">Full bar = {$(target)} ({members.length} × {$(settings.monthlyAmount)}). Orange = some members still owe that month.</p>
          </Card>
        </div>

        {viewer.role === "ADMIN" && (
          <Card title="Add expense" className="flex-[1_1_300px]">
            <ExpenseForm members={eligible.length} currency={settings.currencySymbol} today={dateInput()} accounts={accounts} />
          </Card>
        )}
      </div>
    </div>
  );
}
