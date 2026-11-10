import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, membersWithLedgers } from "@/lib/society";
import { openAccounts } from "@/lib/books";
import { owedLandShares } from "@/lib/services/withdrawals";
import { whatsappConfigured } from "@/lib/messaging";
import { currentMonth, monthLabel } from "@/lib/months";
import { dateInput, fmtDay, whatsappLink } from "@/lib/format";
import { rateFor } from "@/lib/rates";
import { Icon } from "@/components/icons";
import { Card, Notice, PageHeader, StatCard, METHOD_LABELS, secondaryButton, smallButton, smallSecondary } from "@/components/ui";
import { quickApprove } from "./payments/actions";
import { closeRequest } from "./members/actions";
import { PendingDetailsChange } from "@/components/PendingDetailsChange";
import { QuickApprove } from "./QuickApprove";

export default async function AdminDashboard() {
  const viewer = await requireStaff();
  const settings = await getSettings();
  const canEdit = viewer.role === "ADMIN";
  const [fund, members, queue, requests, withdrawals, problems, alerts, accounts, passed, owed, me] = await Promise.all([
    fundSummary(),
    membersWithLedgers(settings),
    prisma.payment.findMany({ where: { status: "PENDING" }, include: { member: true }, orderBy: { createdAt: "asc" }, take: 40 }),
    prisma.memberRequest.findMany({ where: { status: "OPEN" }, include: { member: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.withdrawal.findMany({ where: { status: "PENDING" }, include: { member: { select: { name: true } } } }),
    prisma.withdrawal.findMany({ where: { status: "PAID", memberConfirmedAt: null, problemNote: { not: null } }, include: { member: { select: { name: true } } } }),
    prisma.notification.findMany({ where: { userId: viewer.userId, readAt: null }, orderBy: { createdAt: "desc" }, take: 8 }),
    openAccounts(),
    prisma.investment.findMany({ where: { status: "PASSED" } }),
    owedLandShares(),
    prisma.user.findUniqueOrThrow({ where: { id: viewer.userId } }),
  ]);
  if (alerts.length) await prisma.notification.updateMany({ where: { id: { in: alerts.map((a) => a.id) } }, data: { readAt: new Date() } });
  const $ = (n: number) => money(n, settings.currencySymbol);
  const now = currentMonth();
  const paidThisMonth = members.filter((m) => m.ledger.statusFor(now) === "paid").length;
  const target = members.length * rateFor(now, settings.rates);
  const collected = paidThisMonth * rateFor(now, settings.rates);
  const owing = members.filter((m) => m.ledger.due > 0).sort((a, b) => b.ledger.due - a.ledger.due);
  const outstanding = owing.reduce((s, m) => s + m.ledger.due, 0);
  const noNominee = members.filter((m) => !m.hasNominee);
  const reminder = (name: string, due: number) =>
    `Assalamu alaikum ${name.split(" ")[0]}, a reminder from ${settings.societyName}: your deposit of ${$(due)} is due by the ${settings.reminderDay}th. Please pay and upload the proof in the app. Thank you!`;
  // One queue row per batch (months paid together).
  const batches = new Map<string, typeof queue>();
  for (const p of queue) batches.set(p.batchId ?? p.id, [...(batches.get(p.batchId ?? p.id) ?? []), p]);
  const owedOpen = owed.filter((o) => !o.follow || o.follow.status !== "PAID");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${monthLabel(now, "long")} · ${members.length} members · ${$(rateFor(now, settings.rates))} each`}
        action={<Link href="/admin/report" className={`${secondaryButton} no-underline`}>Month report</Link>}
      />

      {canEdit && whatsappConfigured() && !me.contactPhone && (
        <Notice tone="warn">Add your WhatsApp number in <Link href="/admin/settings#me">Settings</Link> to turn on the 6-digit login code for your admin account.</Notice>
      )}
      {canEdit && !whatsappConfigured() && (
        <Notice tone="neutral">WhatsApp isn&apos;t connected yet, so login codes, invites and reminders can&apos;t be sent automatically. The app gives you ready-to-send WhatsApp links instead. See DEPLOY.md → WhatsApp.</Notice>
      )}

      {(alerts.length > 0 || withdrawals.length > 0 || requests.length > 0 || problems.length > 0 || passed.length > 0 || owedOpen.length > 0 || noNominee.length > 0) && (
        <div className="flex flex-col gap-2">
          {alerts.map((a) => (
            <Link key={a.id} href={a.url ?? "/admin"} className="no-underline">
              <Notice tone={a.kind === "security" ? "bad" : "neutral"}><strong>{a.title}:</strong> {a.body}</Notice>
            </Link>
          ))}
          {withdrawals.map((w) => (
            <Link key={w.id} href={`/admin/withdrawals/${w.id}`} className="no-underline">
              <Notice tone="warn">
                {w.firstApprover ? `Second admin needed: ${w.member.name}'s settlement.` : `${w.member.name} ${w.kind === "FULL" ? (w.eraseData ? "asked to delete their account and leave" : "asked to leave the society") : w.kind === "LAND_SHARE" ? "is owed a land share" : `asked to withdraw ${$(w.amount ?? 0)}`}.`} Review settlement →
              </Notice>
            </Link>
          ))}
          {passed.map((i) => (
            <Link key={i.id} href="/admin/investments" className="no-underline">
              <Notice tone="warn">Members approved “{i.name}”. {i.firstApprover ? "A second admin must confirm paying it out." : `Record the ${$(i.amount)} paid out to start it.`} →</Notice>
            </Link>
          ))}
          {owedOpen.map((o) => (
            <Link key={o.id} href={`/admin/withdrawals/${o.id}`} className="no-underline">
              <Notice tone="neutral">Still owed: {o.member.name}&apos;s land share of {$(o.landShare ?? 0)}, payable when the land is sold.</Notice>
            </Link>
          ))}
          {problems.map((w) => (
            <Link key={w.id} href={`/admin/withdrawals/${w.id}`} className="no-underline">
              <Notice tone="bad">{w.member.name} reported a problem with their payout: {w.problemNote}</Notice>
            </Link>
          ))}
          {noNominee.length > 0 && (
            <Notice tone="warn">No nominee on record for {noNominee.slice(0, 5).map((m) => m.name).join(", ")}{noNominee.length > 5 ? ` and ${noNominee.length - 5} more` : ""}. Every member needs one (BR-13).</Notice>
          )}
          {requests.filter((r) => r.changes).map((r) => <PendingDetailsChange key={r.id} request={r} showMember canEdit={canEdit} />)}
          {requests.filter((r) => !r.changes).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-[13px] ring-1 ring-line">
              <span><strong>{r.member.name}</strong> asks: {r.message}</span>
              <span className="flex gap-2">
                <Link href={`/admin/members/${r.memberId}`} className={`${smallSecondary} no-underline`}>Open member</Link>
                {canEdit && <form action={closeRequest.bind(null, r.id)}><button className={smallButton}>Mark done</button></form>}
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
          <div className="h-2 overflow-hidden rounded bg-[#ECEAE2]"><div className="h-2 bg-brand" style={{ width: `${target ? Math.min(100, (collected / target) * 100) : 0}%` }} /></div>
          <div className="text-xs text-muted">{paidThisMonth} of {members.length} members · target {$(target)}</div>
        </div>
        <StatCard label="Waiting for approval" value={$(fund.pendingAmount)} hint={`${batches.size} proofs to check`} tone="warn" />
        <StatCard label="Not yet paid" value={`${owing.length} member${owing.length === 1 ? "" : "s"}`} hint={`${$(outstanding)} outstanding`} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card title="Approval queue" action={<span className="text-[13px] text-muted">Approve only after the money shows in the society account</span>} className="min-w-0 flex-[3_1_560px]">
          {batches.size === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nothing waiting for approval.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[760px] text-sm">
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
                  {[...batches.values()].slice(0, 12).map((b) => {
                    const p = b[0];
                    return (
                      <tr key={p.id} className="border-b border-[#EFEDE6] align-top">
                        <td className="px-4 py-3 sm:px-2">
                          <div className="font-bold">{p.member.name}</div>
                          <div className="text-xs text-muted">{b.map((x) => monthLabel(x.forMonth)).join(", ")} · {$(b.reduce((s, x) => s + x.amount, 0))}</div>
                        </td>
                        <td className="px-2 py-3">{METHOD_LABELS[p.method]}</td>
                        <td className="px-2 py-3 text-[13px] tracking-wide">{p.reference ?? "—"}</td>
                        <td className="px-2 py-3 text-[13px] text-muted">{fmtDay(p.createdAt)}</td>
                        <td className="px-2 py-3">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex gap-3">
                              <Link href={`/admin/payments/${p.id}`} className="py-1 text-[13px] font-bold">View proof</Link>
                              {canEdit && <Link href={`/admin/payments/${p.id}#reject`} className="py-1 text-[13px] font-bold text-bad">Reject</Link>}
                            </div>
                            {canEdit && <QuickApprove action={quickApprove.bind(null, p.id)} paidOn={dateInput(p.paidOn)} today={dateInput()} accounts={accounts} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                    <div className="text-xs text-muted">{m.pendingCount > 0 ? "Proof waiting for approval" : m.ledger.behind ? `${m.ledger.monthsOwed - m.ledger.monthsPaid} month(s) behind` : "This month"}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold">{$(m.ledger.due)}</span>
                    <a href={whatsappLink(m.phone, reminder(m.name, m.ledger.due))} target="_blank" rel="noopener noreferrer" aria-label={`Remind ${m.name} on WhatsApp`} className="flex h-11 w-11 items-center justify-center rounded-lg text-brand hover:bg-paper">
                      <Icon name="whatsapp" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            {settings.remindersOn ? `Automatic reminders go out on the ${settings.reminderDay}th${whatsappConfigured() ? " on WhatsApp and" : ""} in the app.` : "Automatic reminders are off (Settings)."} The WhatsApp button opens a ready-to-send reminder.
          </p>
          {canEdit && owing.length > 0 && <Link href="/admin/report/remind" className="mt-2 inline-block text-[13px] font-bold">Remind everyone who owes →</Link>}
        </Card>
      </div>
    </div>
  );
}
