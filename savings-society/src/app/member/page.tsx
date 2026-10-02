import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { approvedTotalFor, fundSummary } from "@/lib/society";
import { addMonths, currentMonth, monthLabel, monthRange } from "@/lib/months";
import { Badge, Card, MonthCell, MonthLegend, StatCard, primaryButton } from "@/components/ui";

export default async function MemberHome() {
  const session = await requireMember();
  const [settings, member, approvedTotal, recent, fund] = await Promise.all([
    getSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    approvedTotalFor(session.userId),
    prisma.payment.findMany({ where: { memberId: session.userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    fundSummary(),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const ledger = memberLedger(member, approvedTotal, settings);
  const now = currentMonth();
  const thisMonth = ledger.statusFor(now);
  const gridStart = addMonths(now, -11) > ledger.firstMonth ? addMonths(now, -11) : ledger.firstMonth;
  const gridMonths = monthRange(gridStart, addMonths(now, 2));
  const myNet = ledger.paid - fund.expenseSharePerMember;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-5 text-white shadow-sm">
        <p className="text-sm text-teal-100">Hello, {member.name.split(" ")[0]}</p>
        <p className="mt-3 text-sm text-teal-100">{ledger.due > 0 ? "You owe" : "You're all set"}</p>
        <p className="text-3xl font-semibold">{ledger.due > 0 ? $(ledger.due) : "✓ Up to date"}</p>
        <p className="mt-1 text-sm text-teal-100">
          {monthLabel(now, "long")}:{" "}
          {thisMonth === "paid" ? "paid" : thisMonth === "partial" ? "partly paid" : `${$(settings.monthlyAmount)} due`}
          {ledger.advance > 0 && ` · ${$(ledger.advance)} paid in advance`}
        </p>
        <Link
          href="/member/pay"
          className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
        >
          ➕ Submit a payment
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="My total deposits" value={$(ledger.paid)} hint="Approved by admin" tone="good" />
        <StatCard label="Expected so far" value={$(ledger.expected)} hint={`${ledger.monthsOwed} months × ${$(settings.monthlyAmount)}`} />
        <StatCard label="My share of costs" value={$(fund.expenseSharePerMember)} hint={`Split across ${fund.activeMembers} members`} />
        <StatCard label="My net savings" value={$(myNet)} hint="Deposits − cost share" tone={myNet >= 0 ? "good" : "bad"} />
      </div>

      <Card title="Monthly deposits">
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 lg:grid-cols-14">
          {gridMonths.map((m) => (
            <MonthCell key={m} month={m} status={ledger.statusFor(m)} />
          ))}
        </div>
        <MonthLegend />
        <p className="mt-2 text-xs text-slate-500">
          {ledger.paidThrough ? `Paid through ${monthLabel(ledger.paidThrough, "long")}. ` : ""}
          Payments are applied to your oldest unpaid month first.
        </p>
      </Card>

      <Card
        title="Recent submissions"
        action={
          <Link href="/member/history" className="text-sm font-medium text-teal-700">
            View all
          </Link>
        }
      >
        {recent.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">You haven&apos;t submitted any payments yet.</p>
            <Link href="/member/pay" className={`mt-3 inline-block ${primaryButton}`}>
              Submit your first payment
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{$(p.amount)} · {monthLabel(p.forMonth)}</p>
                  {p.status === "REJECTED" && p.reviewNote && (
                    <p className="truncate text-xs text-red-600">Reason: {p.reviewNote}</p>
                  )}
                </div>
                <Badge label={p.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
