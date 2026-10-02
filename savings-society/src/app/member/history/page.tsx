import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { monthLabel } from "@/lib/months";
import { fmtDay } from "@/lib/format";
import { Badge, Notice, METHOD_LABELS } from "@/components/ui";

export default async function HistoryPage({ searchParams }: PageProps<"/member/history">) {
  const session = await requireMember();
  const { submitted } = await searchParams;
  const [settings, member, payments, payouts] = await Promise.all([
    getSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    prisma.payment.findMany({ where: { memberId: session.userId }, orderBy: { createdAt: "desc" } }),
    prisma.withdrawal.findMany({ where: { memberId: session.userId, status: { in: ["APPROVED", "PAID"] } }, orderBy: { createdAt: "desc" } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const deposited = payments.filter((p) => p.status === "APPROVED").reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
  const ledger = memberLedger(member, deposited, settings);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold">My history</h1>
        <Link href="/member/withdraw" className="py-2.5 text-sm font-bold">Withdraw</Link>
      </div>

      {submitted && <Notice>Payment sent. You&apos;ll see it approved once the admin confirms the money reached the account.</Notice>}

      <div className="grid grid-cols-3 gap-2">
        {[
          ["Deposited", deposited],
          ["Pending", pending],
          ["Due", ledger.due],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-xl border border-line bg-white p-3">
            <div className="text-xs text-muted">{label}</div>
            <div className={`text-base font-extrabold ${label === "Due" && ledger.due > 0 ? "text-bad" : ""}`}>{$(value as number)}</div>
          </div>
        ))}
      </div>

      {payouts.map((w) => (
        <Link key={w.id} href={`/member/payouts/${w.id}`} className="flex items-center justify-between rounded-xl border border-line bg-white px-3.5 py-3 text-ink no-underline">
          <div className="flex flex-col gap-0.5">
            <div className="text-sm font-semibold">{w.kind === "PARTIAL" ? "Partial withdrawal" : "Exit settlement"}</div>
            <div className="text-xs text-muted">{w.payable != null ? $(w.payable) : ""} · {w.paidAt ? `paid ${fmtDay(w.paidAt)}` : "payout scheduled"}</div>
          </div>
          <Badge label={w.status} />
        </Link>
      ))}

      <div className="flex flex-col gap-2">
        {payments.length === 0 && <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">Nothing submitted yet.</p>}
        {payments.map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-line bg-white px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="text-sm font-semibold">
                  {monthLabel(p.forMonth, "long")}
                  {p.monthsCount > 1 && ` + ${p.monthsCount - 1} more`}
                </div>
                <div className="truncate text-xs text-muted">
                  {$(p.amount)} · {METHOD_LABELS[p.method]}
                  {p.status === "PENDING" && p.reference ? ` · TXN ${p.reference}` : ""}
                  {p.reviewedAt ? ` · ${p.status === "APPROVED" ? "approved" : "reviewed"} ${fmtDay(p.reviewedAt)}` : ""}
                </div>
              </div>
              <Badge label={p.status} />
            </div>
            {p.status === "APPROVED" && (
              <Link href={`/member/receipts/${p.id}`} className="self-start py-1 text-[13px] font-bold">View receipt</Link>
            )}
            {p.status === "REJECTED" && p.reviewNote && (
              <p className="rounded-lg bg-bad-bg px-2.5 py-2 text-xs leading-snug text-bad">Admin: {p.reviewNote}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
