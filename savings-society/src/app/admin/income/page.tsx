import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { monthKey } from "@/lib/months";
import { dateInput, daysFromNow, fmtDate, fmtDay } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Card, Empty, Notice, PageHeader, Pill, dangerLink, fileClass, inputClass, labelClass, smallSecondary, INCOME_LABELS } from "@/components/ui";
import { addIncome, closeFdr, deleteIncome, openFdr } from "./actions";

export default async function IncomePage() {
  const [settings, fund, fdrs, incomes, closed] = await Promise.all([
    getSettings(),
    fundSummary(),
    prisma.fdr.findMany({ orderBy: [{ status: "desc" }, { maturesOn: "asc" }] }),
    prisma.income.findMany({ orderBy: { date: "desc" }, include: { investment: { select: { name: true } } } }),
    prisma.monthClose.findMany({ select: { month: true } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const closedMonths = new Set(closed.map((c) => c.month));
  const accounts = settings.cashAccounts.split("\n").map((s) => s.trim()).filter(Boolean);
  const soon = daysFromNow(14);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Other income & FDRs"
        subtitle="Bank interest, FDR profit and donations are shared with members like investment profit. Moving money into an FDR is a transfer, not a cost."
        back={{ href: "/admin", label: "Dashboard" }}
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-6">
          <Card title="FDRs">
            {fdrs.length === 0 && <Empty>No FDRs.</Empty>}
            <ul className="flex flex-col gap-3">
              {fdrs.map((f) => (
                <li key={f.id} className="flex flex-col gap-3 rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-bold">{f.bank}</div>
                      <div className="text-[13px] text-muted">Opened {fmtDate(f.openedOn)}{f.rate != null && ` · rate ${f.rate}%`}</div>
                    </div>
                    {f.status === "OPEN" ? <Pill tone={f.maturesOn <= soon ? "warn" : "good"}>{f.maturesOn <= soon ? "Matures soon" : "Open"}</Pill> : <Pill>Closed</Pill>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-xs text-muted">Amount</div><div className="font-bold">{$(f.amount)}</div></div>
                    <div><div className="text-xs text-muted">Matures</div><div className="font-bold">{fmtDate(f.maturesOn)}</div></div>
                  </div>
                  {f.status === "OPEN" && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted">At maturity, record the profit below, then close it (or open a new FDR to renew).</p>
                      <ConfirmButton action={closeFdr.bind(null, f.id)} confirmText="Close this FDR (money moved back to savings)?" className={smallSecondary}>Close FDR</ConfirmButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <details className="mt-4">
              <summary className={`${smallSecondary} cursor-pointer list-none`}>Open new FDR (transfer)</summary>
              <ActionForm action={openFdr} submitLabel="Add FDR" className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="f-bank" className={labelClass}>Bank and term</label>
                  <input id="f-bank" name="bank" required placeholder="[Bank] FDR · 6 months" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="f-amount" className={labelClass}>Amount ({settings.currencySymbol})</label>
                  <input id="f-amount" name="amount" type="number" min="1" required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="f-rate" className={labelClass}>Rate % (optional)</label>
                  <input id="f-rate" name="rate" type="number" step="0.01" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="f-open" className={labelClass}>Opened</label>
                  <input id="f-open" name="openedOn" type="date" required defaultValue={dateInput()} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="f-mat" className={labelClass}>Matures</label>
                  <input id="f-mat" name="maturesOn" type="date" required className={inputClass} />
                </div>
              </ActionForm>
            </details>
          </Card>

          <Card title="Income recorded" action={<span className="text-sm font-bold text-good">+&nbsp;{$(fund.totalProfit)} in total</span>}>
            {incomes.length === 0 ? (
              <Empty>No other income recorded yet this year.</Empty>
            ) : (
              <ul className="flex flex-col">
                {incomes.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-[#EFEDE6] py-3 last:border-0">
                    <span className="w-14 text-[13px] text-muted">{fmtDay(i.date)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{i.description}</div>
                      <div className="text-xs text-muted">
                        {INCOME_LABELS[i.kind]}{i.account && ` · ${i.account}`}{i.investment && ` · ${i.investment.name}`}
                        {i.filePath && <> · <a href={fileUrl(i.filePath)} target="_blank" rel="noopener noreferrer">statement</a></>}
                      </div>
                    </div>
                    <span className="font-bold text-good">+&nbsp;{$(i.amount)}</span>
                    {!closedMonths.has(monthKey(i.date)) && (
                      <ConfirmButton action={deleteIncome.bind(null, i.id)} confirmText="Delete this income entry?" className={dangerLink}>Delete</ConfirmButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Record income" className="flex-[1_1_320px]">
          <ActionForm action={addIncome} submitLabel="Save income">
            <div>
              <label htmlFor="i-kind" className={labelClass}>Type</label>
              <select id="i-kind" name="kind" defaultValue="BANK_INTEREST" className={inputClass}>
                {Object.entries(INCOME_LABELS).filter(([k]) => k !== "INVESTMENT_PROFIT").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="i-amount" className={labelClass}>Amount ({settings.currencySymbol})</label>
                <input id="i-amount" name="amount" type="number" min="1" step="any" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="i-date" className={labelClass}>Date</label>
                <input id="i-date" name="date" type="date" required defaultValue={dateInput()} className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="i-account" className={labelClass}>Into account</label>
              <select id="i-account" name="account" className={inputClass}>
                {accounts.map((a) => <option key={a}>{a}</option>)}
                {fdrs.filter((f) => f.status === "OPEN").map((f) => <option key={f.id}>{f.bank}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="i-desc" className={labelClass}>Description</label>
              <input id="i-desc" name="description" required placeholder="e.g. Bank interest, Jul–Sep" className={inputClass} />
            </div>
            <div>
              <label htmlFor="i-file" className={labelClass}>Attach statement</label>
              <input id="i-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
            </div>
            <Notice tone="neutral">Shared equally across the {fund.activeMembers} members&apos; profit share. Tax deducted by the bank goes in Expenses.</Notice>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
