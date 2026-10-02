import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { tally } from "@/lib/votes";
import { fmtDay } from "@/lib/format";
import { INVESTMENT_KIND_LABELS, VOTE_RULE_LABELS } from "@/components/ui";
import { castVote } from "./actions";

export default async function InvestPage() {
  const session = await requireMember();
  const [settings, fund, proposals, investments] = await Promise.all([
    getSettings(),
    fundSummary(),
    prisma.investment.findMany({
      where: { status: "PROPOSED" },
      include: { votes: true, _count: { select: { documents: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.investment.findMany({
      where: { status: { in: ["ACTIVE", "CLOSED"] } },
      include: { incomes: { select: { amount: true } } },
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);

  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="text-[22px] font-bold">Investments</h1>

      <div className="grid grid-cols-2 gap-3.5 rounded-[20px] bg-brand p-[18px] text-white">
        <div className="flex flex-col gap-0.5"><div className="text-xs text-brand-soft">Society invested</div><div className="text-lg font-extrabold">{$(fund.invested)}</div></div>
        <div className="flex flex-col gap-0.5"><div className="text-xs text-brand-soft">Cash in account</div><div className="text-lg font-extrabold">{$(fund.cash)}</div></div>
        <div className="flex flex-col gap-0.5 border-t border-[#3E8370] pt-3"><div className="text-xs text-brand-soft">My profit share</div><div className="text-lg font-extrabold">+&nbsp;{$(fund.profitSharePerMember)}</div></div>
        <div className="flex flex-col gap-0.5 border-t border-[#3E8370] pt-3"><div className="text-xs text-brand-soft">My share of assets</div><div className="text-lg font-extrabold">1 / {fund.activeMembers}</div></div>
      </div>

      {proposals.map((p) => {
        const t = tally(p.votes, p.voteRule, fund.activeMembers);
        const mine = p.votes.find((v) => v.memberId === session.userId)?.choice;
        const ended = p.voteEndsAt != null && p.voteEndsAt < new Date();
        return (
          <section key={p.id} className="flex flex-col gap-2.5 rounded-2xl border-2 border-[#E8B567] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold tracking-wide text-warn">
                {ended ? "VOTING CLOSED" : `VOTE NEEDED${p.voteEndsAt ? ` · ENDS ${fmtDay(p.voteEndsAt).toUpperCase()}` : ""}`}
              </div>
              <div className="text-xs text-muted">{t.yes} yes · {t.no} no</div>
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-extrabold">{p.name}</h2>
              <p className="text-[13px] text-muted">
                {INVESTMENT_KIND_LABELS[p.kind]} · {$(p.amount)}
                {p.plan && ` · ${p.plan}`} · {p._count.documents} document{p._count.documents === 1 ? "" : "s"}
              </p>
              {p.details && <p className="text-[13px] text-muted">{p.details}</p>}
            </div>
            <div className="h-2 overflow-hidden rounded bg-[#ECEAE2]" role="progressbar" aria-valuemin={0} aria-valuemax={t.needed} aria-valuenow={t.yes} aria-label="Yes votes">
              <div className="h-2 bg-brand" style={{ width: `${Math.min(100, Math.round((t.yes / Math.max(t.needed, 1)) * 100))}%` }} />
            </div>
            <p className="text-xs text-muted">Needs {t.needed} yes votes to pass ({VOTE_RULE_LABELS[p.voteRule].toLowerCase()} of {fund.activeMembers})</p>
            {!ended &&
              (mine ? (
                <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2.5">
                  <div className="text-sm font-bold">You voted {mine === "YES" ? "yes" : "no"}</div>
                  <form action={castVote.bind(null, p.id, null)}>
                    <button className="h-11 px-2 text-[13px] font-semibold text-muted underline">Change</button>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <form action={castVote.bind(null, p.id, "YES")}>
                    <button className="h-11 w-full rounded-xl bg-brand text-sm font-bold text-white">Vote yes</button>
                  </form>
                  <form action={castVote.bind(null, p.id, "NO")}>
                    <button className="h-11 w-full rounded-xl border border-field bg-white text-sm font-bold text-ink">Vote no</button>
                  </form>
                </div>
              ))}
          </section>
        );
      })}

      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">Our investments</h2>
        <div className="flex gap-4">
          <Link href="/member/fund" className="py-1.5 text-[13px] font-bold">Books</Link>
          <Link href="/member/documents" className="py-1.5 text-[13px] font-bold">Documents</Link>
        </div>
      </div>
      {investments.length === 0 && <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">No investments yet.</p>}
      {investments.map((i) => {
        const profit = i.incomes.reduce((s, x) => s + x.amount, 0);
        const closedGain = i.status === "CLOSED" ? (i.returnedAmount ?? i.amount) - i.amount + profit : 0;
        return (
          <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-sm font-bold">{i.name}</div>
              <div className="text-xs text-muted">
                {INVESTMENT_KIND_LABELS[i.kind]} · {i.status === "CLOSED" ? "closed" : "active"}
                {i.startedAt && i.status === "ACTIVE" && ` · since ${fmtDay(i.startedAt)}`}
                {profit > 0 && i.status === "ACTIVE" && ` · ${$(profit)} profit so far`}
              </div>
            </div>
            <div className="text-right text-[13px] font-bold">{i.status === "CLOSED" ? `${closedGain >= 0 ? "+" : ""} ${$(closedGain)}` : $(i.amount)}</div>
          </div>
        );
      })}
    </div>
  );
}
