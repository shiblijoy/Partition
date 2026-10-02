import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { Card, PageHeader, StatCard, inputClass, labelClass, CATEGORY_LABELS } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ProofLink } from "@/components/ProofLink";
import { addExpense, deleteExpense } from "./actions";

export default async function ExpensesPage() {
  const [settings, fund, expenses, byCategory] = await Promise.all([
    getSettings(),
    fundSummary(),
    prisma.expense.findMany({ orderBy: { date: "desc" }, include: { createdBy: { select: { name: true } } } }),
    prisma.expense.groupBy({ by: ["category"], _sum: { amount: true } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Costs"
        subtitle="Everything spent from the fund. Costs are shared equally by active members and shown to them on the Fund page."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total costs" value={$(fund.totalExpenses)} tone="warn" />
        <StatCard label="Per member" value={$(fund.expenseSharePerMember)} hint={`${fund.activeMembers} active members`} />
        {byCategory
          .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))
          .slice(0, 2)
          .map((c) => (
            <StatCard key={c.category} label={CATEGORY_LABELS[c.category]} value={$(c._sum.amount ?? 0)} />
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card title="Add a cost">
          <ActionForm action={addExpense} submitLabel="Add cost">
            <div>
              <label htmlFor="description" className={labelClass}>What for</label>
              <input id="description" name="description" required placeholder="e.g. Bank account maintenance fee" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="amount" className={labelClass}>Amount</label>
                <input id="amount" name="amount" type="number" min="0.01" step="any" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="date" className={labelClass}>Date</label>
                <input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="category" className={labelClass}>Category</label>
              <select id="category" name="category" defaultValue="BANK_CHARGE" className={inputClass}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="receipt" className={labelClass}>Receipt <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            </div>
          </ActionForm>
        </Card>

        <Card title="All costs">
          {expenses.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No costs recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  {e.receiptPath && <ProofLink path={e.receiptPath} size={40} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.description}</p>
                    <p className="text-xs text-slate-500">
                      {CATEGORY_LABELS[e.category]} · {e.date.toLocaleDateString()}
                      {e.createdBy && ` · by ${e.createdBy.name}`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{$(e.amount)}</p>
                  <ConfirmButton
                    action={deleteExpense.bind(null, e.id)}
                    confirmText="Delete this cost?"
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
