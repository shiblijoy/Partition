import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, memberPosition } from "@/lib/society";
import { tally } from "@/lib/votes";
import { tFor, dateName } from "@/lib/i18n";
import { INVESTMENT_KIND_LABELS, VOTE_RULE_LABELS } from "@/components/ui";
import { castVote } from "./actions";

/** FR-INV-09: every investment, its status and the member's own profit share; FR-INV-04 voting. */
export default async function InvestPage() {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const lang = viewer.language;
  const [settings, fund, position, proposals, investments] = await Promise.all([
    getSettings(),
    fundSummary(),
    memberPosition(viewer.userId),
    prisma.investment.findMany({ where: { status: "PROPOSED" }, include: { votes: true, _count: { select: { documents: { where: { adminOnly: false, replacedById: null } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.investment.findMany({ where: { status: { in: ["PASSED", "ACTIVE", "CLOSED"] } }, include: { incomes: { where: { reversedAt: null }, select: { amount: true } } }, orderBy: [{ status: "asc" }, { startedAt: "desc" }] }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);

  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="text-[22px] font-bold">{t("Investments")}</h1>

      <div className="grid grid-cols-2 gap-3.5 rounded-[20px] bg-brand p-[18px] text-white">
        <div className="flex flex-col gap-0.5"><div className="text-xs text-brand-soft">{t("Society invested")}</div><div className="text-lg font-extrabold">{$(fund.invested)}</div></div>
        <div className="flex flex-col gap-0.5"><div className="text-xs text-brand-soft">{t("Cash in account")}</div><div className="text-lg font-extrabold">{$(fund.cash)}</div></div>
        <div className="flex flex-col gap-0.5 border-t border-[#3E8370] pt-3"><div className="text-xs text-brand-soft">{t("My profit share")}</div><div className="text-lg font-extrabold">+&nbsp;{$(position.profitShare)}</div></div>
        <div className="flex flex-col gap-0.5 border-t border-[#3E8370] pt-3"><div className="text-xs text-brand-soft">{t("My share of assets")}</div><div className="text-lg font-extrabold">1 / {fund.activeMembers}</div></div>
      </div>

      {proposals.map((p) => {
        const tl = tally(p.votes, p.voteRule, fund.activeMembers);
        const mine = p.votes.find((v) => v.memberId === viewer.userId)?.choice;
        const ended = p.voteEndsAt != null && p.voteEndsAt < new Date();
        return (
          <section key={p.id} className="flex flex-col gap-2.5 rounded-2xl border-2 border-[#E8B567] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold tracking-wide text-warn">
                {ended ? t("VOTING CLOSED") : p.voteEndsAt ? t("VOTE NEEDED · ENDS {date}", { date: dateName(p.voteEndsAt, lang, false).toUpperCase() }) : t("VOTE NEEDED")}
              </div>
              <div className="text-xs text-muted">{t("{yes} yes · {no} no", { yes: tl.yes, no: tl.no })}</div>
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-extrabold">{p.name}</h2>
              <p className="text-[13px] text-muted">
                {t(INVESTMENT_KIND_LABELS[p.kind])} · {$(p.amount)}{p.plan && ` · ${p.plan}`} · <Link href="/member/documents">{t("{n} document(s)", { n: p._count.documents })}</Link>
              </p>
              {p.details && <p className="text-[13px] text-muted">{p.details}</p>}
            </div>
            <div className="h-2 overflow-hidden rounded bg-[#ECEAE2]" role="progressbar" aria-valuemin={0} aria-valuemax={tl.needed} aria-valuenow={tl.yes} aria-label={t("Yes votes")}>
              <div className="h-2 bg-brand" style={{ width: `${Math.min(100, Math.round((tl.yes / Math.max(tl.needed, 1)) * 100))}%` }} />
            </div>
            <p className="text-xs text-muted">{t("Needs {n} yes votes to pass ({rule} of {members})", { n: tl.needed, rule: t(VOTE_RULE_LABELS[p.voteRule]).toLowerCase(), members: fund.activeMembers })}</p>
            {!ended && !viewer.readOnly &&
              (mine ? (
                <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2.5">
                  <div className="text-sm font-bold">{mine === "YES" ? t("You voted yes") : t("You voted no")}</div>
                  <form action={castVote.bind(null, p.id, null)}>
                    <button className="h-11 px-2 text-[13px] font-semibold text-muted underline">{t("Change")}</button>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <form action={castVote.bind(null, p.id, "YES")}><button className="h-11 w-full rounded-xl bg-brand text-sm font-bold text-white">{t("Vote yes")}</button></form>
                  <form action={castVote.bind(null, p.id, "NO")}><button className="h-11 w-full rounded-xl border border-field bg-white text-sm font-bold text-ink">{t("Vote no")}</button></form>
                </div>
              ))}
          </section>
        );
      })}

      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">{t("Our investments")}</h2>
        <div className="flex gap-4">
          <Link href="/member/fund" className="py-1.5 text-[13px] font-bold">{t("Books")}</Link>
          <Link href="/member/documents" className="py-1.5 text-[13px] font-bold">{t("Documents")}</Link>
        </div>
      </div>
      {investments.length === 0 && <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">{t("No investments yet.")}</p>}
      {investments.map((i) => {
        const profit = i.incomes.reduce((s, x) => s + x.amount, 0);
        const closedGain = i.status === "CLOSED" ? (i.returnedAmount ?? i.amount) - i.amount + profit : 0;
        return (
          <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-sm font-bold">{i.name}</div>
              <div className="text-xs text-muted">
                {t(INVESTMENT_KIND_LABELS[i.kind])} · {t(i.status === "CLOSED" ? "closed" : i.status === "PASSED" ? "approved, not yet invested" : "active")}
                {i.startedAt && i.status === "ACTIVE" && ` · ${t("since {date}", { date: dateName(i.startedAt, lang, false) })}`}
                {profit > 0 && i.status === "ACTIVE" && ` · ${t("{amount} profit so far", { amount: $(profit) })}`}
              </div>
            </div>
            <div className="text-right text-[13px] font-bold">{i.status === "CLOSED" ? `${closedGain >= 0 ? "+" : ""} ${$(closedGain)}` : $(i.amount)}</div>
          </div>
        );
      })}
    </div>
  );
}
