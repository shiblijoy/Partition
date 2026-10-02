import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { Card, PageHeader, StatCard, CATEGORY_LABELS } from "@/components/ui";
import { ProofLink } from "@/components/ProofLink";

/** Read-only view of the society's books, so every member can see where the money is. */
export default async function FundPage() {
  await requireMember();
  const [settings, fund, expenses] = await Promise.all([
    getSettings(),
    fundSummary(),
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 50 }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);

  return (
    <div className="space-y-6">
      <PageHeader title="Society fund" subtitle="Open books: what's been collected and what's been spent." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total collected" value={$(fund.totalCollected)} tone="good" />
        <StatCard label="Total costs" value={$(fund.totalExpenses)} tone="warn" />
        <StatCard label="Fund balance" value={$(fund.balance)} hint="Collected − costs" />
        <StatCard label="Members" value={String(fund.activeMembers)} hint={`Cost share ${$(fund.expenseSharePerMember)} each`} />
      </div>
      <Card title="Costs">
        {expenses.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No costs recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                {e.receiptPath && <ProofLink path={e.receiptPath} size={40} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.description}</p>
                  <p className="text-xs text-slate-500">
                    {CATEGORY_LABELS[e.category]} · {e.date.toLocaleDateString()}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{$(e.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
