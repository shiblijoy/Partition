import Link from "next/link";
import { money } from "@/lib/settings";
import { monthLabel } from "@/lib/months";
import type { MonthStatus } from "@/lib/ledger";
import { Card, PageHeader, StatCard, MonthLegend, secondaryButton } from "@/components/ui";
import { buildReport } from "./data";

const CELL: Record<MonthStatus, string> = {
  paid: "bg-emerald-500 text-white",
  partial: "bg-amber-400 text-white",
  due: "bg-red-100 text-red-700",
  upcoming: "bg-slate-100 text-slate-400",
  "before-join": "text-slate-300",
};
const CELL_MARK: Record<MonthStatus, string> = { paid: "✓", partial: "½", due: "✕", upcoming: "", "before-join": "–" };

export default async function ReportPage() {
  const { settings, months, members, fund, cashFlow } = await buildReport();
  const $ = (n: number) => money(n, settings.currencySymbol);
  const totals = members.reduce(
    (acc, m) => ({ paid: acc.paid + m.ledger.paid, expected: acc.expected + m.ledger.expected, due: acc.due + m.ledger.due }),
    { paid: 0, expected: 0, due: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Report" subtitle="Who has paid which month, each member's account, and the fund's cash flow." />
        <Link href="/admin/report/csv" className={secondaryButton} prefetch={false}>⬇ Download CSV</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected" value={$(fund.totalCollected)} tone="good" />
        <StatCard label="Costs" value={$(fund.totalExpenses)} tone="warn" />
        <StatCard label="Balance" value={$(fund.balance)} />
        <StatCard label="Outstanding" value={$(totals.due)} tone={totals.due > 0 ? "bad" : "good"} />
      </div>

      <Card title="Deposits by month">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="sticky left-0 bg-white px-4 py-2 text-left font-medium sm:px-2">Member</th>
                {months.map((m) => (
                  <th key={m} className="px-1 py-2 font-medium whitespace-nowrap">{monthLabel(m).replace(" 20", " '")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="sticky left-0 bg-white px-4 py-1.5 whitespace-nowrap sm:px-2">
                    <Link href={`/admin/members/${m.id}`} className="font-medium hover:text-teal-700">{m.name}</Link>
                  </td>
                  {months.map((month) => {
                    const s = m.ledger.statusFor(month);
                    return (
                      <td key={month} className="px-0.5 py-1">
                        <div className={`mx-auto w-8 rounded py-1 text-center font-semibold ${CELL[s]}`}>{CELL_MARK[s]}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MonthLegend />
      </Card>

      <Card title="Member accounts">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 sm:px-2">Member</th>
                <th className="px-2 py-2 text-right">Deposited</th>
                <th className="px-2 py-2 text-right">Expected</th>
                <th className="px-2 py-2 text-right">Due</th>
                <th className="px-2 py-2 text-right">Cost share</th>
                <th className="px-2 py-2 text-right">Net savings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 sm:px-2">{m.name}</td>
                  <td className="px-2 py-2 text-right">{$(m.ledger.paid)}</td>
                  <td className="px-2 py-2 text-right text-slate-500">{$(m.ledger.expected)}</td>
                  <td className={`px-2 py-2 text-right ${m.ledger.due > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}>
                    {m.ledger.due > 0 ? $(m.ledger.due) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-500">{$(fund.expenseSharePerMember)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{$(m.ledger.paid - fund.expenseSharePerMember)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold">
                <td className="px-4 py-2 sm:px-2">Total</td>
                <td className="px-2 py-2 text-right">{$(totals.paid)}</td>
                <td className="px-2 py-2 text-right">{$(totals.expected)}</td>
                <td className="px-2 py-2 text-right text-red-600">{$(totals.due)}</td>
                <td className="px-2 py-2 text-right">{$(fund.totalExpenses)}</td>
                <td className="px-2 py-2 text-right">{$(totals.paid - fund.totalExpenses)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Net savings totals include only active members; deposits from inactive members still count toward the fund balance.
        </p>
      </Card>

      <Card title="Cash flow by month">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 sm:px-2">Month</th>
                <th className="px-2 py-2 text-right">Collected</th>
                <th className="px-2 py-2 text-right">Costs</th>
                <th className="px-2 py-2 text-right">Balance after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cashFlow.slice().reverse().map((row) => (
                <tr key={row.month}>
                  <td className="px-4 py-2 sm:px-2">{monthLabel(row.month, "long")}</td>
                  <td className="px-2 py-2 text-right text-emerald-700">{row.collected ? $(row.collected) : "—"}</td>
                  <td className="px-2 py-2 text-right text-amber-700">{row.spent ? $(row.spent) : "—"}</td>
                  <td className="px-2 py-2 text-right font-medium">{$(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Based on the date money was paid (approved payments only) and the date costs were incurred.</p>
      </Card>
    </div>
  );
}
