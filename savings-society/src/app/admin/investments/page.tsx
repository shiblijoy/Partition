import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { openAccounts } from "@/lib/books";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { tally } from "@/lib/votes";
import { dateInput, daysFromNow, fmtDate } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { AccountSelect } from "@/components/AccountSelect";
import { Card, Empty, PageHeader, Pill, StatCard, inputClass, smallButton, smallSecondary, INVESTMENT_KIND_LABELS, VOTE_RULE_LABELS } from "@/components/ui";
import { ProposalForm } from "./ProposalForm";
import { closeInvestment, finishVote, recordProfit, startInvestment, updateValuation, withdrawProposal } from "./actions";

const FILTERS = ["All", "Land", "Business", "Shares", "Closed"] as const;

export default async function InvestmentsPage({ searchParams }: PageProps<"/admin/investments">) {
  const { filter: raw } = await searchParams;
  const viewer = await requireStaff();
  const canEdit = viewer.role === "ADMIN";
  const filter = FILTERS.includes(raw as (typeof FILTERS)[number]) ? (raw as (typeof FILTERS)[number]) : "All";
  const [settings, fund, all, accounts, admins] = await Promise.all([
    getSettings(),
    fundSummary(),
    prisma.investment.findMany({
      include: { votes: true, incomes: { where: { reversedAt: null }, select: { amount: true } }, valuations: { orderBy: { date: "desc" }, take: 3 }, _count: { select: { documents: true } } },
      orderBy: { createdAt: "desc" },
    }),
    openAccounts(),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true } }),
  ]);
  const adminName = (id: string | null) => admins.find((a) => a.id === id)?.name ?? "an admin";
  const passed = all.filter((i) => i.status === "PASSED");
  const $ = (n: number) => money(n, settings.currencySymbol);
  const proposals = all.filter((i) => i.status === "PROPOSED");
  const shown = all.filter((i) =>
    i.status === "PROPOSED"
      ? false
      : filter === "All"
        ? i.status === "ACTIVE" || i.status === "CLOSED"
        : filter === "Closed"
          ? i.status === "CLOSED" || i.status === "REJECTED"
          : i.kind === filter.toUpperCase() && i.status === "ACTIVE"
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Investments" back={{ href: "/admin", label: "Dashboard" }} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Cash available" value={$(fund.cash)} hint="Deposits − expenses − invested + profit" tone="brand" />
        <StatCard label="Currently invested" value={$(fund.invested)} hint={`${fund.activeInvestments} active`} />
        <StatCard label="Profit received" value={`+\u00a0${$(fund.totalProfit)}`} hint={`${$(fund.profitSharePerMember)} per member`} tone="good" />
        <StatCard label="Value gain (estimated)" value={`${fund.unrealisedGain >= 0 ? "+ " : ""}${$(fund.unrealisedGain)}`} hint="Not counted until sold" />
      </div>

      {proposals.length > 0 && (
        <Card title="Votes in progress">
          <ul className="flex flex-col">
            {proposals.map((p) => {
              const t = tally(p.votes, p.voteRule, fund.activeMembers);
              const ended = !!p.voteEndsAt && p.voteEndsAt < new Date();
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEDE6] py-3 last:border-0">
                  <div>
                    <div className="font-bold">{p.name} · {$(p.amount)}</div>
                    <div className="text-[13px] text-muted">
                      {t.yes} yes · {t.no} no · {fund.activeMembers - t.yes - t.no} not voted · needs {t.needed} ({VOTE_RULE_LABELS[p.voteRule].toLowerCase()})
                      {p.voteEndsAt && ` · ${ended ? "ended" : "ends"} ${fmtDate(p.voteEndsAt)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={t.passed ? "good" : t.canPass ? "warn" : "bad"}>{t.passed ? "Passing" : t.canPass ? "Open" : "Can't pass"}</Pill>
                    {canEdit && (
                      <>
                        <ActionForm action={finishVote.bind(null, p.id)} submitLabel="Close vote now" buttonClass={smallButton} className="flex"><span className="sr-only">Close vote</span></ActionForm>
                        <ActionForm action={withdrawProposal.bind(null, p.id)} submitLabel="Withdraw" buttonClass={smallSecondary} className="flex"><span className="sr-only">Withdraw proposal</span></ActionForm>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {passed.length > 0 && (
        <Card title="Approved by members · record the money paid out">
          <ul className="flex flex-col gap-4">
            {passed.map((p) => {
              const needsTwo = settings.dualApprovalLimit != null && p.amount > settings.dualApprovalLimit;
              return (
                <li key={p.id} className="flex flex-col gap-2 border-b border-[#EFEDE6] pb-4 last:border-0 last:pb-0">
                  <div className="font-bold">{p.name} · {$(p.amount)}</div>
                  {needsTwo && <p className="text-[13px] text-warn">Above the society&apos;s limit of {$(settings.dualApprovalLimit!)}: two admins must confirm.{p.firstApprover && ` ${adminName(p.firstApprover)} has confirmed; waiting for a second admin.`}</p>}
                  {canEdit && (
                    <div className="flex flex-wrap items-end gap-2">
                      <ActionForm action={startInvestment.bind(null, p.id)} submitLabel={p.firstApprover ? "Confirm as second admin & invest" : "Record payment & start investment"} buttonClass={smallButton} className="flex flex-wrap items-end gap-2" resetOnSuccess={false}>
                        <AccountSelect accounts={accounts} label="Paid from" id={`inv-acc-${p.id}`} />
                        <input name="date" type="date" defaultValue={dateInput()} aria-label="Date paid out" className={`${inputClass} w-44`} />
                      </ActionForm>
                      <ActionForm action={withdrawProposal.bind(null, p.id)} submitLabel="Withdraw" buttonClass={smallSecondary} className="flex"><span className="sr-only">Withdraw</span></ActionForm>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-4">
          <nav className="flex flex-wrap gap-2" aria-label="Filter investments">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={`/admin/investments?filter=${f}`}
                aria-current={f === filter ? "page" : undefined}
                className={`flex h-10 items-center rounded-full px-4 text-[13px] no-underline ${f === filter ? "bg-ink font-bold text-white" : "border border-field bg-white font-semibold text-muted"}`}
              >
                {f}
              </Link>
            ))}
          </nav>
          {shown.length === 0 && <Card><Empty>No investments here.</Empty></Card>}
          {shown.map((v) => {
            // For a closed investment the gain on the money returned counts as profit too.
            const profit = v.incomes.reduce((s, x) => s + x.amount, 0) + (v.status === "CLOSED" ? (v.returnedAmount ?? v.amount) - v.amount : 0);
            return (
              <Card key={v.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper text-sm font-extrabold">{v.kind[0]}</span>
                    <div>
                      <h2 className="text-base font-extrabold">{v.name}</h2>
                      <p className="text-[13px] text-muted">{INVESTMENT_KIND_LABELS[v.kind]}{v.details && ` · ${v.details}`}{v.plan && ` · ${v.plan}`}</p>
                    </div>
                  </div>
                  <Pill tone={v.status === "ACTIVE" ? "good" : v.status === "REJECTED" ? "bad" : "neutral"}>{v.status === "REJECTED" ? "Not approved" : v.status.toLowerCase()}</Pill>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><div className="text-xs text-muted">Invested</div><div className="font-bold">{$(v.amount)}</div></div>
                  <div><div className="text-xs text-muted">Date</div><div className="font-bold">{v.startedAt ? fmtDate(v.startedAt) : "—"}</div></div>
                  {v.kind === "BUSINESS" ? (
                    <>
                      <div><div className="text-xs text-muted">Profit received</div><div className="font-bold text-good">+&nbsp;{$(profit)}</div></div>
                      <div><div className="text-xs text-muted">Return so far</div><div className="font-bold">{v.amount ? Math.round((profit / v.amount) * 1000) / 10 : 0}%</div></div>
                    </>
                  ) : (
                    <>
                      <div><div className="text-xs text-muted">Estimated value now</div><div className="font-bold">{v.currentValue != null ? $(v.currentValue) : "—"}</div></div>
                      <div><div className="text-xs text-muted">Gain if sold</div><div className="font-bold">{v.currentValue != null ? $(v.currentValue - v.amount) : "—"}</div></div>
                    </>
                  )}
                </div>
                {v.status === "CLOSED" && (
                  <p className="mt-3 text-[13px] text-muted">
                    Closed {v.closedAt ? fmtDate(v.closedAt) : ""}: {$(v.returnedAmount ?? 0)} returned{profit > 0 && ` +\u00a0${$(profit)} profit`}.
                  </p>
                )}
                {v.valuations.length > 0 && (
                  <p className="mt-2 text-xs text-muted">Valuations: {v.valuations.map((x) => `${$(x.value)} (${fmtDate(x.date)}${x.recordedBy ? `, ${x.recordedBy}` : ""})`).join(" · ")}</p>
                )}
                {v.status === "ACTIVE" && canEdit && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EFEDE6] pt-4">
                    {v.kind !== "LAND" && (
                      <details>
                        <summary className={`${smallButton} cursor-pointer list-none`}>Record profit payment</summary>
                        <ActionForm action={recordProfit.bind(null, v.id)} submitLabel="Save" buttonClass={smallButton} className="mt-2 flex flex-wrap items-end gap-2">
                          <input name="amount" type="number" min="1" required aria-label="Profit amount" placeholder="Amount" className={`${inputClass} w-36`} />
                          <input name="date" type="date" defaultValue={dateInput()} aria-label="Date received" className={`${inputClass} w-44`} />
                          <AccountSelect accounts={accounts} label="Into account" id={`prof-${v.id}`} compact />
                        </ActionForm>
                      </details>
                    )}
                    {v.kind !== "BUSINESS" && (
                      <details>
                        <summary className={`${smallButton} cursor-pointer list-none`}>Update valuation</summary>
                        <ActionForm action={updateValuation.bind(null, v.id)} submitLabel="Save" buttonClass={smallButton} className="mt-2 flex flex-wrap items-end gap-2" resetOnSuccess={false}>
                          <input name="value" type="number" min="0" required defaultValue={v.currentValue ?? v.amount} aria-label="Estimated value" className={`${inputClass} w-44`} />
                        </ActionForm>
                      </details>
                    )}
                    <details>
                      <summary className={`${smallSecondary} cursor-pointer list-none`}>Sell / close</summary>
                      <ActionForm action={closeInvestment.bind(null, v.id)} submitLabel="Close investment" buttonClass={smallSecondary} className="mt-2 flex flex-wrap items-end gap-2">
                        <input name="returned" type="number" min="0" required aria-label="Amount returned to the fund" placeholder="Amount returned" className={`${inputClass} w-44`} />
                      </ActionForm>
                    </details>
                    <Link href={`/admin/documents?investment=${v.id}`} className={`${smallSecondary} no-underline`}>Documents ({v._count.documents})</Link>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {canEdit && (
          <Card title="New investment proposal" className="flex-[1_1_340px]">
            <ProposalForm cash={fund.cash} cashLabel={$(fund.cash)} currency={settings.currencySymbol} members={fund.activeMembers} defaultRule={settings.defaultVoteRule} nextWeek={dateInput(daysFromNow(7))} />
            <p className="mt-3 text-xs text-muted">Voting closes automatically at the deadline and every member is told the result.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
