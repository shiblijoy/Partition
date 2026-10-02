import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, membersWithLedgers } from "@/lib/society";
import { currentMonth, monthLabel } from "@/lib/months";
import { fmtDay, whatsappLink } from "@/lib/format";
import { Icon } from "@/components/icons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Card, Notice, PageHeader, StatCard, METHOD_LABELS, secondaryButton, smallButton, smallSecondary } from "@/components/ui";
import { approvePayment } from "./payments/actions";
import { closeRequest } from "./members/actions";
import { PendingDetailsChange } from "@/components/PendingDetailsChange";

export default async function AdminDashboard() {
  const settings = await getSettings();
  const [fund, members, queue, requests, withdrawals, problems] = await Promise.all([
    fundSummary(),
    membersWithLedgers(settings),
    prisma.payment.findMany({ where: { status: "PENDING" }, include: { member: true }, orderBy: { createdAt: "asc" }, take: 12 }),
    prisma.memberRequest.findMany({ where: { status: "OPEN" }, include: { member: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.withdrawal.findMany({ where: { status: "PENDING" }, include: { member: { select: { name: true } } } }),
    prisma.withdrawal.findMany({ where: { status: "PAID", memberConfirmedAt: null, problemNote: { not: null } }, include: { member: { select: { name: true } } } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const now = currentMonth();
  const paidThisMonth = members.filter((m) => m.ledger.statusFor(now) === "paid").length;
  const target = members.length * settings.monthlyAmount;
  const collected = paidThisMonth * settings.monthlyAmount;
  const owing = members.filter((m) => m.ledger.due > 0).sort((a, b) => b.ledger.due - a.ledger.due);
  const outstanding = owing.reduce((s, m) => s + m.ledger.due, 0);
  const reminder = (name: string, due: number) =>
    `Assalamu alaikum ${name.split(" ")[0]}, a reminder from ${settings.societyName}: your deposit of ${$(due)} is due by the ${settings.reminderDay}th. Please pay and upload the proof in the app. Thank you!`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${monthLabel(now, "long")} · ${members.length} members · ${$(settings.monthlyAmount)} each`}
        action={<Link href="/admin/report" className={`${secondaryButton} no-underline`}>Export month report</Link>}
      />

      {(withdrawals.length > 0 || requests.length > 0 || problems.length > 0) && (
        <div className="flex flex-col gap-2">
          {withdrawals.map((w) => (
            <Link key={w.id} href={`/admin/withdrawals/${w.id}`} className="no-underline">
              <Notice tone="warn">
                {w.member.name} asked to {w.kind === "FULL" ? (w.eraseData ? "delete their account and leave" : "leave the society") : `withdraw ${$(w.amount ?? 0)}`}. Review settlement →
              </Notice>
            </Link>
          ))}
          {problems.map((w) => (
            <Link key={w.id} href={`/admin/withdrawals/${w.id}`} className="no-underline">
              <Notice tone="bad">{w.member.name} reported a problem with their payout: {w.problemNote}</Notice>
            </Link>
          ))}
          {requests.filter((r) => r.changes).map((r) => (
            <PendingDetailsChange key={r.id} request={r} showMember />
          ))}
          {requests.filter((r) => !r.changes).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-[13px] ring-1 ring-line">
              <span>
                <strong>{r.member.name}</strong> asks: {r.message}
              </span>
              <span className="flex gap-2">
                <Link href={`/admin/members/${r.memberId}`} className={`${smallSecondary} no-underline`}>Open member</Link>
                <form action={closeRequest.bind(null, r.id)}>
                  <button className={smallButton}>Mark done</button>
                </form>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Fund balance" value={$(fund.balance)} hint={`Cash ${$(fund.cash)} · invested ${$(fund.invested)}`} tone="brand" />
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5">
          <div className="text-[13px] font-semibold text-muted">Collected this month</div>
          <div className="text-[26px] font-extrabold">{$(collected)}</div>
          <div className="h-2 overflow-hidden rounded bg-[#ECEAE2]">
            <div className="h-2 bg-brand" style={{ width: `${target ? Math.min(100, (collected / target) * 100) : 0}%` }} />
          </div>
          <div className="text-xs text-muted">{paidThisMonth} of {members.length} members · target {$(target)}</div>
        </div>
        <StatCard label="Waiting for approval" value={$(fund.pendingAmount)} hint={`${fund.pendingCount} proofs to check`} tone="warn" />
        <StatCard label="Not yet paid" value={`${owing.length} member${owing.length === 1 ? "" : "s"}`} hint={`${$(outstanding)} outstanding`} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card
          title="Approval queue"
          action={<span className="text-[13px] text-muted">Approve only after the money shows in the society account</span>}
          className="min-w-0 flex-[3_1_560px]"
        >
          {queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nothing waiting for approval.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-bold text-muted">
                    <th className="px-4 py-2.5 sm:px-2">Member</th>
                    <th className="px-2 py-2.5">Method</th>
                    <th className="px-2 py-2.5">Transaction ID</th>
                    <th className="px-2 py-2.5">Submitted</th>
                    <th className="px-2 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((p) => (
                    <tr key={p.id} className="border-b border-[#EFEDE6]">
                      <td className="px-4 py-3 sm:px-2">
                        <div className="font-bold">{p.member.name}</div>
                        <div className="text-xs text-muted">
                          {monthLabel(p.forMonth)}{p.monthsCount > 1 && ` +${p.monthsCount - 1}`} · {$(p.amount)}
                        </div>
                      </td>
                      <td className="px-2 py-3">{METHOD_LABELS[p.method]}</td>
                      <td className="px-2 py-3 text-[13px] tracking-wide">{p.reference ?? "—"}</td>
                      <td className="px-2 py-3 text-[13px] text-muted">{fmtDay(p.createdAt)}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/admin/payments/${p.id}`} className="px-1 py-2 text-[13px] font-bold">View proof</Link>
                          <ConfirmButton
                            action={approvePayment.bind(null, p.id)}
                            confirmText={`Approve ${$(p.amount)} from ${p.member.name}? Only do this once you've seen the money in the account.`}
                            className={smallButton}
                          >
                            Approve
                          </ConfirmButton>
                          <Link href={`/admin/payments/${p.id}#reject`} className={`${smallSecondary} text-bad no-underline`}>Reject</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Not paid yet" className="flex-[1_1_280px]">
          {owing.length === 0 ? (
            <p className="py-4 text-sm text-muted">Everyone is up to date.</p>
          ) : (
            <ul className="flex flex-col">
              {owing.slice(0, 12).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 border-b border-[#EFEDE6] py-2 last:border-0">
                  <div className="min-w-0">
                    <Link href={`/admin/members/${m.id}`} className="text-sm font-semibold text-ink">{m.name}</Link>
                    <div className="text-xs text-muted">
                      {m.pendingCount > 0 ? "Proof waiting for approval" : m.ledger.due > settings.monthlyAmount ? `${Math.round(m.ledger.due / settings.monthlyAmount)} months behind` : "This month"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold">{$(m.ledger.due)}</span>
                    <a
                      href={whatsappLink(m.phone, reminder(m.name, m.ledger.due))}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Remind ${m.name} on WhatsApp`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-brand hover:bg-paper"
                    >
                      <Icon name="whatsapp" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">The WhatsApp button opens a ready-to-send reminder.</p>
        </Card>
      </div>

      {members.length === 0 && (
        <Card>
          <p className="py-4 text-center text-sm text-muted">
            No members yet. <Link href="/admin/members">Add your members</Link> so they can log in and submit payments.
          </p>
        </Card>
      )}
    </div>
  );
}
