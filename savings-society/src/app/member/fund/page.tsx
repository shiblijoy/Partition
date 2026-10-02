import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { fmtDate } from "@/lib/format";
import { ScreenHeader, CATEGORY_LABELS, INCOME_LABELS } from "@/components/ui";
import { ProofLink } from "@/components/ProofLink";

/** Read-only view of the society's books, so every member can see where the money is. */
export default async function FundPage() {
  await requireMember();
  const [settings, fund, expenses, incomes] = await Promise.all([
    getSettings(),
    fundSummary(),
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 50 }),
    prisma.income.findMany({ orderBy: { date: "desc" }, take: 50 }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const rows: Array<[string, string, boolean?]> = [
    ["Deposits collected", $(fund.totalCollected)],
    ["+ Profit and other income", `+\u00a0${$(fund.totalProfit)}`],
    ["− Costs", `−\u00a0${$(fund.totalExpenses)}`],
    ...(fund.paidOut > 0 ? [["− Paid out to members who left", `−\u00a0${$(fund.paidOut)}`] as [string, string]] : []),
    ["Fund total", $(fund.balance), true],
    ["of which invested", $(fund.invested)],
    ["of which cash", $(fund.cash)],
  ];

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Society books" back="/member/invest" />
      <div className="flex flex-col rounded-2xl border border-line bg-white px-4 py-3">
        {rows.map(([k, v, total]) => (
          <div key={k} className={`flex justify-between gap-3 ${total ? "mt-1 border-t border-line pt-2 text-base font-extrabold" : "py-1 text-sm"}`}>
            <span>{k}</span>
            <span className="font-bold">{v}</span>
          </div>
        ))}
        <p className="pt-2 text-xs text-muted">Costs and profit are shared equally by the {fund.activeMembers} members.</p>
      </div>

      <h2 className="text-[15px] font-bold">Income</h2>
      <ul className="flex flex-col rounded-2xl border border-line bg-white px-4">
        {incomes.length === 0 && <li className="py-3 text-sm text-muted">No income recorded yet.</li>}
        {incomes.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 border-b border-[#EFEDE6] py-2.5 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{i.description}</p>
              <p className="text-xs text-muted">{INCOME_LABELS[i.kind]} · {fmtDate(i.date)}</p>
            </div>
            <p className="text-sm font-bold text-good">+&nbsp;{$(i.amount)}</p>
          </li>
        ))}
      </ul>

      <h2 className="text-[15px] font-bold">Costs</h2>
      <ul className="flex flex-col rounded-2xl border border-line bg-white px-4">
        {expenses.length === 0 && <li className="py-3 text-sm text-muted">No costs recorded.</li>}
        {expenses.map((e) => (
          <li key={e.id} className="flex items-center gap-3 border-b border-[#EFEDE6] py-2.5 last:border-0">
            {e.receiptPath && <ProofLink path={e.receiptPath} size={40} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{e.description}</p>
              <p className="text-xs text-muted">{CATEGORY_LABELS[e.category]} · {fmtDate(e.date)}</p>
            </div>
            <p className="text-sm font-bold">{$(e.amount)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
