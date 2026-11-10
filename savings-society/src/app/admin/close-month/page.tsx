import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { calculatedBalances } from "@/lib/services/reconcile";
import { addMonths, currentMonth, monthLabel, monthRange } from "@/lib/months";
import { fmtDay } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { ReconcileForm } from "./ReconcileForm";
import { closeMonth } from "./actions";

export default async function CloseMonthPage() {
  const viewer = await requireStaff();
  const settings = await getSettings();
  const closed = await prisma.monthClose.findMany({ orderBy: { month: "desc" }, include: { lines: true } });
  const $ = (n: number) => money(n, settings.currencySymbol);
  const closedSet = new Set(closed.map((c) => c.month));
  // The oldest finished month that isn't closed yet.
  const month = monthRange(settings.startMonth, addMonths(currentMonth(), -1)).find((m) => !closedSet.has(m));
  const accounts = month ? await calculatedBalances(month) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={month ? `Close ${monthLabel(month, "long")}` : "Close month"}
        subtitle="Enter each account's real closing balance from its statement. The month locks once every difference is zero or explained."
        back={{ href: "/admin", label: "Dashboard" }}
      />

      {month ? (
        <Card>
          {viewer.role === "ADMIN" ? (
            <ReconcileForm action={closeMonth.bind(null, month)} accounts={accounts.map((a) => ({ id: a.id, name: `${a.name}${a.last4 ? ` ••${a.last4}` : ""}`, calculated: a.balance }))} currency={settings.currencySymbol} monthName={monthLabel(month, "long")} />
          ) : (
            <Empty>{monthLabel(month, "long")} is not closed yet.</Empty>
          )}
        </Card>
      ) : (
        <Card><Empty>Every finished month is closed. The current month can be closed once it ends.</Empty></Card>
      )}

      <Card title="Past months" action={<Link href="/admin/accounts" className="text-[13px] font-bold">Society accounts</Link>}>
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
                      {c.lines.map((l) => (
                        <span key={l.id}> · {l.account}: {$(l.actual)}{l.note && ` (${l.note})`}{l.statementPath && <> <a href={fileUrl(l.statementPath)} target="_blank" rel="noopener noreferrer">statement</a></>}</span>
                      ))}
                    </div>
                  </div>
                  <Pill tone={c.note ? "warn" : "good"}>{c.note ? "Explained difference" : "No difference"}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
