import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { accountBalances, openAccounts } from "@/lib/books";
import { dateInput, fmtDay } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { AccountSelect } from "@/components/AccountSelect";
import { Card, Empty, PageHeader, StatCard, inputClass, labelClass, smallSecondary, ACCOUNT_TYPE_LABELS } from "@/components/ui";
import { addAccount, closeAccount, moveMoney } from "./actions";

const TYPE_LABEL: Record<string, string> = { DEPOSIT: "Deposit", EXPENSE: "Expense", INCOME: "Income", INVEST_OUT: "Invested", CAPITAL_BACK: "Capital back", PAYOUT: "Payout", TRANSFER: "Transfer" };

/** FR-REC-01 and §5: the society's accounts, and the ledger every figure in the app is summed from. */
export default async function AccountsPage({ searchParams }: PageProps<"/admin/accounts">) {
  const viewer = await requireStaff();
  const canEdit = viewer.role === "ADMIN";
  const { account } = await searchParams;
  const filter = typeof account === "string" ? account : undefined;
  const [settings, balances, open, entries] = await Promise.all([
    getSettings(),
    accountBalances(),
    openAccounts(prisma),
    prisma.ledgerEntry.findMany({ where: filter ? { accountId: filter } : {}, include: { account: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const total = balances.reduce((s, a) => s + a.balance, 0);
  const memberIds = [...new Set(entries.map((e) => e.memberId).filter(Boolean))] as string[];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Accounts & ledger" subtitle="Where the society's money is, and every movement of it. All totals in the app are sums of these entries; nothing is typed in." back={{ href: "/admin", label: "Dashboard" }} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <StatCard label="Cash in all accounts" value={$(total)} tone="brand" />
        {balances.filter((a) => a.active).map((a) => (
          <Link key={a.id} href={`/admin/accounts?account=${a.id}`} className="no-underline">
            <StatCard label={`${a.name}${a.last4 ? ` ••${a.last4}` : ""}`} value={$(a.balance)} hint={ACCOUNT_TYPE_LABELS[a.type]} />
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card title={filter ? `Ledger · ${balances.find((a) => a.id === filter)?.name ?? ""}` : "Ledger"} action={filter && <Link href="/admin/accounts" className="text-[13px] font-bold">All accounts</Link>} className="min-w-0 flex-[3_1_600px]">
          {entries.length === 0 ? (
            <Empty>No entries yet.</Empty>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-bold text-muted">
                    <th className="px-4 py-2.5 sm:px-2">Date</th>
                    <th className="px-2 py-2.5">Type</th>
                    <th className="px-2 py-2.5">Account</th>
                    <th className="px-2 py-2.5">Detail</th>
                    <th className="px-2 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-[#EFEDE6]">
                      <td className="px-4 py-2 text-muted sm:px-2">{fmtDay(e.date)}</td>
                      <td className="px-2 py-2">{TYPE_LABEL[e.type]}{e.reversesId && <span className="block text-xs text-bad">reversal</span>}</td>
                      <td className="px-2 py-2">{e.account.name}</td>
                      <td className="px-2 py-2 text-[13px]">{e.memberId ? names.get(e.memberId) : e.note}{e.createdBy && <span className="block text-xs text-muted">by {e.createdBy}</span>}</td>
                      <td className={`px-2 py-2 text-right font-bold ${e.amount < 0 ? "text-bad" : "text-good"}`}>{e.amount > 0 ? "+ " : ""}{$(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-[1_1_320px] flex-col gap-6">
          {canEdit && (
            <Card title="Move money between accounts">
              <ActionForm action={moveMoney} submitLabel="Move money">
                <AccountSelect accounts={open} name="fromId" label="From" id="mv-from" />
                <AccountSelect accounts={open} name="toId" label="To" id="mv-to" defaultValue={open[1]?.id} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mv-amount" className={labelClass}>Amount</label>
                    <input id="mv-amount" name="amount" type="number" min="1" required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="mv-date" className={labelClass}>Date</label>
                    <input id="mv-date" name="date" type="date" defaultValue={dateInput()} max={dateInput()} className={inputClass} />
                  </div>
                </div>
                <input name="note" aria-label="Note" placeholder="e.g. Moved to the FDR bank account" className={inputClass} />
              </ActionForm>
            </Card>
          )}
          <Card title="Society accounts">
            <ul className="flex flex-col">
              {balances.map((a) => (
                <li key={a.id} className={`flex items-center justify-between gap-2 border-b border-[#EFEDE6] py-2.5 last:border-0 ${a.active ? "" : "opacity-50"}`}>
                  <div>
                    <div className="text-sm font-bold">{a.name}{a.last4 && ` ••${a.last4}`}</div>
                    <div className="text-xs text-muted">{ACCOUNT_TYPE_LABELS[a.type]}{a.openingBalance ? ` · opening ${$(a.openingBalance)}` : ""}{!a.active && " · closed"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{$(a.balance)}</span>
                    {canEdit && a.active && a.type !== "FDR" && a.balance === 0 && (
                      <ActionForm action={closeAccount.bind(null, a.id)} submitLabel="Close" buttonClass={smallSecondary} className="flex"><span className="sr-only">Close account</span></ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {canEdit && (
              <details className="mt-3">
                <summary className={`${smallSecondary} cursor-pointer list-none`}>Add an account</summary>
                <ActionForm action={addAccount} submitLabel="Add account" className="mt-3 flex flex-col gap-3">
                  <div>
                    <label htmlFor="ac-name" className={labelClass}>Name</label>
                    <input id="ac-name" name="name" required placeholder="e.g. Dutch-Bangla savings" className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ac-type" className={labelClass}>Type</label>
                      <select id="ac-type" name="type" className={inputClass}>
                        {["BANK", "CASH"].map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ac-last4" className={labelClass}>Last 4 digits</label>
                      <input id="ac-last4" name="last4" inputMode="numeric" maxLength={4} pattern="\d{4}" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ac-open" className={labelClass}>Balance when the app started keeping its books</label>
                    <input id="ac-open" name="openingBalance" type="number" min="0" defaultValue={0} className={inputClass} />
                  </div>
                  <p className="text-xs text-muted">Only the last 4 digits of an account number are stored.</p>
                </ActionForm>
              </details>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
