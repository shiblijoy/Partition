import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { cashAsOf } from "@/lib/society";
import { addMonths, currentMonth, monthEnd, monthLabel, monthRange } from "@/lib/months";
import { fmtDay } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { ReconcileForm } from "./ReconcileForm";
import { closeMonth } from "./actions";

export default async function CloseMonthPage() {
  const settings = await getSettings();
  const [closed, fdrs] = await Promise.all([
    prisma.monthClose.findMany({ orderBy: { month: "desc" }, include: { lines: true } }),
    prisma.fdr.findMany(),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const closedSet = new Set(closed.map((c) => c.month));
  // The oldest finished month that isn't closed yet.
  const month = monthRange(settings.startMonth, addMonths(currentMonth(), -1)).find((m) => !closedSet.has(m));
  const end = month ? monthEnd(month) : null;
  const appBalance = end ? await cashAsOf(end) : 0;
  const accounts = [
    ...settings.cashAccounts.split("\n").map((s) => s.trim()).filter(Boolean),
    ...(end ? fdrs.filter((f) => f.openedOn <= end && (!f.closedOn || f.closedOn > end)).map((f) => f.bank) : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={month ? `Close ${monthLabel(month, "long")}` : "Close month"}
        subtitle="Enter each account's real closing balance from its statement. The month locks once every difference is zero or explained."
        back={{ href: "/admin", label: "Dashboard" }}
      />

      {month ? (
        <Card>
          <ReconcileForm
            action={closeMonth.bind(null, month)}
            accounts={accounts}
            appBalance={appBalance}
            currency={settings.currencySymbol}
            monthName={monthLabel(month, "long")}
          />
        </Card>
      ) : (
        <Card><Empty>Every finished month is closed. The current month can be closed once it ends.</Empty></Card>
      )}

      <Card title="Past months" action={<Link href="/admin/settings#accounts" className="text-[13px] font-bold">Manage society accounts</Link>}>
        {closed.length === 0 ? (
          <Empty>No months closed yet.</Empty>
        ) : (
          <ul className="flex flex-col">
            {closed.map((c) => {
              const actual = c.lines.reduce((s, l) => s + l.actual, 0);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEDE6] py-3 last:border-0">
                  <div>
                    <div className="font-bold">{monthLabel(c.month, "long")}</div>
                    <div className="text-xs text-muted">
                      Closed {fmtDay(c.closedAt)} by {c.closedBy} · books {$(c.appBalance)} · accounts {$(actual)}
                      {c.note && ` · note: ${c.note}`}
                      {c.lines.filter((l) => l.statementPath).map((l) => (
                        <span key={l.id}> · <a href={fileUrl(l.statementPath!)} target="_blank" rel="noopener noreferrer">{l.account}</a></span>
                      ))}
                    </div>
                  </div>
                  <Pill tone={c.note ? "warn" : "good"}>{c.note ? "1 note" : "No difference"}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
