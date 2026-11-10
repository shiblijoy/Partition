import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, memberPosition } from "@/lib/society";
import { tFor, dateName } from "@/lib/i18n";
import { ScreenHeader, CATEGORY_LABELS, INCOME_LABELS } from "@/components/ui";
import { ProofLink } from "@/components/ProofLink";

/** FR-EXP-04: open books — every member sees the expense list, income, and their own cost share. */
export default async function FundPage() {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const lang = viewer.language;
  const [settings, fund, position, expenses, incomes] = await Promise.all([
    getSettings(),
    fundSummary(),
    memberPosition(viewer.userId),
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 100 }),
    prisma.income.findMany({ orderBy: { date: "desc" }, take: 100 }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const rows: Array<[string, string, boolean?]> = [
    [t("Deposits collected"), $(fund.totalCollected)],
    [t("+ Profit and other income"), `+ ${$(fund.totalProfit)}`],
    [t("− Costs"), `− ${$(fund.totalExpenses)}`],
    ...(fund.paidOut > 0 ? [[t("− Paid out to members who left"), `− ${$(fund.paidOut)}`] as [string, string]] : []),
    [t("Fund total"), $(fund.balance), true],
    [t("of which invested"), $(fund.invested)],
    [t("of which cash"), $(fund.cash)],
  ];

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title={t("Society books")} back="/member/invest" />
      <div className="flex flex-col rounded-2xl border border-line bg-white px-4 py-3">
        {rows.map(([k, v, total]) => (
          <div key={k} className={`flex justify-between gap-3 ${total ? "mt-1 border-t border-line pt-2 text-base font-extrabold" : "py-1 text-sm"}`}>
            <span>{k}</span>
            <span className="font-bold">{v}</span>
          </div>
        ))}
        <p className="pt-2 text-xs text-muted">{t("Costs and profit are shared equally by the members active on the day each happened.")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-white p-3"><div className="text-xs text-muted">{t("My cost share")}</div><div className="text-base font-extrabold">{$(position.costShare)}</div></div>
        <div className="rounded-xl border border-line bg-white p-3"><div className="text-xs text-muted">{t("My profit share")}</div><div className="text-base font-extrabold">{$(position.profitShare)}</div></div>
      </div>

      <h2 className="text-[15px] font-bold">{t("Income")}</h2>
      <ul className="flex flex-col rounded-2xl border border-line bg-white px-4">
        {incomes.length === 0 && <li className="py-3 text-sm text-muted">{t("No income recorded yet.")}</li>}
        {incomes.map((i) => (
          <li key={i.id} className={`flex items-center justify-between gap-3 border-b border-[#EFEDE6] py-2.5 last:border-0 ${i.reversedAt ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{i.description}</p>
              <p className="text-xs text-muted">{t(INCOME_LABELS[i.kind])} · {dateName(i.date, lang)}{i.reversedAt && ` · ${t("reversed")}`}</p>
            </div>
            <p className={`text-sm font-bold text-good ${i.reversedAt ? "line-through" : ""}`}>+&nbsp;{$(i.amount)}</p>
          </li>
        ))}
      </ul>

      <h2 className="text-[15px] font-bold">{t("Costs")}</h2>
      <ul className="flex flex-col rounded-2xl border border-line bg-white px-4">
        {expenses.length === 0 && <li className="py-3 text-sm text-muted">{t("No costs recorded.")}</li>}
        {expenses.map((e) => (
          <li key={e.id} className={`flex items-center gap-3 border-b border-[#EFEDE6] py-2.5 last:border-0 ${e.reversedAt ? "opacity-60" : ""}`}>
            {e.receiptPath && <ProofLink path={e.receiptPath} size={40} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{e.description}</p>
              <p className="text-xs text-muted">{t(CATEGORY_LABELS[e.category])} · {dateName(e.date, lang)}{e.reversedAt && ` · ${t("reversed")}: ${e.reversalReason}`}</p>
            </div>
            <p className={`text-sm font-bold ${e.reversedAt ? "line-through" : ""}`}>{$(e.amount)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
