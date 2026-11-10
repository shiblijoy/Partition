import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { accountBalances, openAccounts } from "@/lib/books";
import { dateInput, daysFromNow, fmtDate, fmtDay } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { ActionForm } from "@/components/ActionForm";
import { AccountSelect } from "@/components/AccountSelect";
import { Card, Empty, Notice, PageHeader, Pill, dangerLink, fileClass, inputClass, labelClass, smallSecondary, INCOME_LABELS } from "@/components/ui";
import { addIncome, closeFdr, openFdr, reverse } from "./actions";

export default async function IncomePage() {
  const viewer = await requireStaff();
  const canEdit = viewer.role === "ADMIN";
  const [settings, fund, balances, incomes, accounts] = await Promise.all([
    getSettings(),
    fundSummary(),
    accountBalances(),
    prisma.income.findMany({ orderBy: { date: "desc" }, include: { investment: { select: { name: true } } } }),
    openAccounts(),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const fdrs = balances.filter((a) => a.type === "FDR");
  const names = new Map(balances.map((a) => [a.id, a.name]));
  const soon = daysFromNow(7);
  const incomeAccounts = [...accounts, ...fdrs.filter((f) => f.active)];

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
                      <div className="font-bold">{f.name}</div>
                      <div className="text-[13px] text-muted">Opened {f.openedOn ? fmtDate(f.openedOn) : "—"}{f.rate != null && ` · rate ${f.rate}%`}</div>
                    </div>
                    {f.active ? <Pill tone={f.maturesOn && f.maturesOn <= soon ? "warn" : "good"}>{f.maturesOn && f.maturesOn <= soon ? "Matures within 7 days" : "Open"}</Pill> : <Pill>Closed</Pill>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-xs text-muted">Balance</div><div className="font-bold">{$(f.balance)}</div></div>
                    <div><div className="text-xs text-muted">Matures</div><div className="font-bold">{f.maturesOn ? fmtDate(f.maturesOn) : "—"}</div></div>
                  </div>
                  {f.active && canEdit && (
                    <details>
                      <summary className={`${smallSecondary} cursor-pointer list-none`}>Close at maturity</summary>
                      <ActionForm action={closeFdr.bind(null, f.id)} submitLabel="Close FDR" buttonClass={smallSecondary} className="mt-2 flex flex-wrap items-end gap-2">
                        <AccountSelect accounts={accounts} name="toId" label="Move the balance to" id={`close-${f.id}`} />
                        <input name="date" type="date" defaultValue={dateInput()} aria-label="Closing date" className={`${inputClass} w-44`} />
                        <p className="w-full text-xs text-muted">Record the FDR profit below as income first (into this FDR or the account it pays into).</p>
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <details className="mt-4">
                <summary className={`${smallSecondary} cursor-pointer list-none`}>Open new FDR (transfer)</summary>
                <ActionForm action={openFdr} submitLabel="Open FDR" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="f-bank" className={labelClass}>Bank and term</label>
                    <input id="f-bank" name="bank" required placeholder="[Bank] FDR · 6 months" className={inputClass} />
                  </div>
                  <AccountSelect accounts={accounts} name="fromId" label="Money comes from" id="fdr-from" />
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
                  <p className="text-xs text-muted sm:col-span-2">You&apos;ll be reminded 7 days before it matures.</p>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Income recorded" action={<span className="text-sm font-bold text-good">+&nbsp;{$(fund.totalIncome)} in total</span>}>
            {incomes.length === 0 ? (
              <Empty>No other income recorded yet.</Empty>
            ) : (
              <ul className="flex flex-col">
                {incomes.map((i) => (
                  <li key={i.id} className={`flex flex-wrap items-center gap-3 border-b border-[#EFEDE6] py-3 last:border-0 ${i.reversedAt ? "text-muted" : ""}`}>
                    <span className="w-14 text-[13px] text-muted">{fmtDay(i.date)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{i.description}</div>
                      <div className="text-xs text-muted">
                        {INCOME_LABELS[i.kind]}{i.accountId && ` · ${names.get(i.accountId) ?? ""}`}{i.investment && ` · ${i.investment.name}`}
                        {i.filePath && <> · <a href={fileUrl(i.filePath)} target="_blank" rel="noopener noreferrer">statement</a></>}
                        {i.reversedAt && <span className="text-bad"> · reversed: {i.reversalReason}</span>}
                      </div>
                    </div>
                    <span className={`font-bold text-good ${i.reversedAt ? "line-through" : ""}`}>+&nbsp;{$(i.amount)}</span>
                    {canEdit && !i.reversedAt && (
                      <details>
                        <summary className={`${dangerLink} cursor-pointer list-none`}>Reverse</summary>
                        <ActionForm action={reverse.bind(null, i.id)} submitLabel="Reverse" buttonClass={dangerLink} className="mt-1 flex gap-1">
                          <input name="reason" required aria-label="Reason" placeholder="Reason" className="h-9 w-40 rounded-lg border border-field px-2 text-[13px]" />
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {canEdit && (
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
                  <input id="i-amount" name="amount" type="number" min="1" step="1" required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="i-date" className={labelClass}>Date</label>
                  <input id="i-date" name="date" type="date" required defaultValue={dateInput()} max={dateInput()} className={inputClass} />
                </div>
              </div>
              <AccountSelect accounts={incomeAccounts} label="Into account" id="inc-account" />
              <div>
                <label htmlFor="i-desc" className={labelClass}>Description</label>
                <input id="i-desc" name="description" required placeholder="e.g. Bank interest, Jul–Sep" className={inputClass} />
              </div>
              <div>
                <label htmlFor="i-file" className={labelClass}>Attach statement (proof)</label>
                <input id="i-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
              </div>
              <Notice tone="neutral">Shared equally across the members active on that date. Bank charges and tax deducted at source go in Expenses (FR-INC-02).</Notice>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
