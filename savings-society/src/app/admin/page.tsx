import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, membersWithLedgers } from "@/lib/society";
import { currentMonth, monthLabel } from "@/lib/months";
import { Card, PageHeader, StatCard, primaryButton } from "@/components/ui";

export default async function AdminDashboard() {
  const settings = await getSettings();
  const [fund, members, recentExpenses] = await Promise.all([
    fundSummary(),
    membersWithLedgers(settings),
    prisma.expense.aggregate({
      where: { date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      _sum: { amount: true },
    }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const now = currentMonth();

  const paidThisMonth = members.filter((m) => m.ledger.statusFor(now) === "paid").length;
  const owing = members.filter((m) => m.ledger.due > 0).sort((a, b) => b.ledger.due - a.ledger.due);
  const totalArrears = owing.reduce((sum, m) => sum + m.ledger.due, 0);
  const expectedTotal = members.reduce((sum, m) => sum + m.ledger.expected, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`${settings.societyName} at a glance · ${monthLabel(now, "long")}`} />

      {fund.pendingCount > 0 && (
        <Link
          href="/admin/payments"
          className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100"
        >
          <span className="text-sm text-amber-900">
            <strong>{fund.pendingCount}</strong> payment{fund.pendingCount > 1 ? "s" : ""} ({$(fund.pendingAmount)}) waiting for your approval
          </span>
          <span className="text-sm font-semibold text-amber-900">Review →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fund balance" value={$(fund.balance)} hint="Approved deposits − costs" tone="good" />
        <StatCard label="Total collected" value={$(fund.totalCollected)} hint={`of ${$(expectedTotal)} expected`} />
        <StatCard label="Total costs" value={$(fund.totalExpenses)} hint={`${$(recentExpenses._sum.amount ?? 0)} this month`} tone="warn" />
        <StatCard
          label="Outstanding dues"
          value={$(totalArrears)}
          hint={`${owing.length} member${owing.length === 1 ? "" : "s"} behind`}
          tone={totalArrears > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`${monthLabel(now, "long")} collection`}>
          <p className="text-3xl font-semibold text-slate-900">
            {paidThisMonth} <span className="text-lg font-normal text-slate-500">/ {members.length} members paid</span>
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${members.length ? (paidThisMonth / members.length) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Target {$(members.length * settings.monthlyAmount)} at {$(settings.monthlyAmount)} per member.
          </p>
        </Card>

        <Card
          title="Members behind on deposits"
          action={<Link href="/admin/report" className="text-sm font-medium text-teal-700">Full report</Link>}
        >
          {owing.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">Everyone is up to date. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {owing.slice(0, 8).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/admin/members/${m.id}`} className="font-medium hover:text-teal-700">{m.name}</Link>
                  <span className="font-semibold text-red-600">{$(m.ledger.due)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {members.length === 0 && (
        <Card>
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">No members yet. Add your members so they can log in and submit payments.</p>
            <Link href="/admin/members" className={`mt-3 inline-block ${primaryButton}`}>Add members</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
