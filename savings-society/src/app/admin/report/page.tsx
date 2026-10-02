import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { addMonths, currentMonth, isMonthKey, monthLabel, monthRange } from "@/lib/months";
import { fmtDateTime, fmtDay } from "@/lib/format";
import type { MonthStatus } from "@/lib/ledger";
import { Card, Empty, Line, MonthLegend, PageHeader, Pill, StatCard, inputClass, secondaryButton, CATEGORY_LABELS, INCOME_LABELS } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { buildReport, memberStatement, monthReport, periodReport } from "./data";
import { shareReport } from "./actions";

const TYPES = [
  ["month", "Monthly report", "Cash, deposits, expenses, income"],
  ["year", "Annual summary", "For the AGM and members"],
  ["member", "Member statement", "One member's account"],
  ["audit", "Audit log", "Who did what, and when"],
  ["grid", "Deposits grid", "Every member, every month"],
] as const;
type ReportType = (typeof TYPES)[number][0];

const CELL: Record<MonthStatus, string> = {
  paid: "bg-brand text-white",
  partial: "bg-[#C98A3A] text-white",
  due: "bg-bad-bg text-bad",
  upcoming: "bg-paper text-muted",
  "before-join": "text-field",
};
const CELL_MARK: Record<MonthStatus, string> = { paid: "✓", partial: "½", due: "✕", upcoming: "", "before-join": "–" };

export default async function ReportPage({ searchParams }: PageProps<"/admin/report">) {
  const sp = await searchParams;
  const type: ReportType = TYPES.some(([t]) => t === sp.type) ? (sp.type as ReportType) : "month";
  const settings = await getSettings();
  const $ = (n: number) => money(n, settings.currencySymbol);
  const now = currentMonth();
  const lastMonth = addMonths(now, -1) >= settings.startMonth ? addMonths(now, -1) : now;
  const monthOptions = monthRange(settings.startMonth, now).reverse();
  const years = [...new Set(monthOptions.map((m) => m.slice(0, 4)))];
  const members = await prisma.user.findMany({ where: { role: "MEMBER" }, orderBy: [{ memberNo: "asc" }, { name: "asc" }], select: { id: true, name: true, memberNo: true } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        subtitle="Only closed months are final · open months are marked draft"
        back={{ href: "/admin", label: "Dashboard" }}
      />

      <div className="flex flex-wrap items-start gap-6">
        <nav className="no-print flex flex-[1_1_260px] flex-col gap-2" aria-label="Report type">
          {TYPES.map(([t, label, sub]) => (
            <Link
              key={t}
              href={`/admin/report?type=${t}`}
              aria-current={t === type ? "page" : undefined}
              className={`flex flex-col gap-0.5 rounded-xl bg-white px-4 py-3 text-ink no-underline ${t === type ? "border-2 border-brand" : "border border-field"}`}
            >
              <span className="text-sm font-bold">{label}</span>
              <span className="text-xs text-muted">{sub}</span>
            </Link>
          ))}
        </nav>

        <div className="flex min-w-0 flex-[4_1_600px] flex-col gap-4">
          {type === "month" && <MonthlyReport month={isMonthKey(String(sp.month ?? "")) ? String(sp.month) : lastMonth} options={monthOptions} $={$} />}
          {type === "year" && <AnnualReport year={years.includes(String(sp.year)) ? String(sp.year) : now.slice(0, 4)} years={years} $={$} />}
          {type === "member" && <MemberReport memberId={String(sp.member ?? members[0]?.id ?? "")} members={members} $={$} />}
          {type === "audit" && <AuditReport month={isMonthKey(String(sp.month ?? "")) ? String(sp.month) : now} options={monthOptions} />}
          {type === "grid" && <GridReport $={$} />}
        </div>
      </div>
    </div>
  );
}

type Money = (n: number) => string;

function Picker({ type, name, value, options }: { type: string; name: string; value: string; options: Array<[string, string]> }) {
  return (
    <form className="no-print flex flex-wrap items-end gap-2">
      <input type="hidden" name="type" value={type} />
      <select name={name} defaultValue={value} aria-label="Period" className={`${inputClass} mt-0 h-11 w-auto`}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button className={secondaryButton}>Show</button>
    </form>
  );
}

function Actions({ csv, share }: { csv?: string; share?: { title: string; body: string } }) {
  return (
    <div className="no-print flex flex-wrap gap-2">
      <PrintButton />
      {csv && <a href={csv} className={`${secondaryButton} no-underline`}>Download Excel (CSV)</a>}
      {share && (
        <ConfirmButton action={shareReport.bind(null, share.title, share.body)} confirmText="Post this summary on the members' notice board?" className={secondaryButton}>
          Share with members
        </ConfirmButton>
      )}
    </div>
  );
}

async function MonthlyReport({ month, options, $ }: { month: string; options: string[]; $: Money }) {
  const r = await monthReport(month);
  const final = !!r.closedMonth;
  const title = `Monthly report · ${monthLabel(month, "long")}`;
  return (
    <>
      <Picker type="month" name="month" value={month} options={options.map((m) => [m, monthLabel(m, "long")])} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-extrabold">{title}</h2>
            <p className="text-[13px] text-muted">
              {final ? `Closed ${fmtDay(r.closedMonth!.closedAt)} by ${r.closedMonth!.closedBy}${r.closedMonth!.note ? ` · note: ${r.closedMonth!.note}` : " · no difference with statements"}` : "Month not closed yet · figures can still change"}
            </p>
          </div>
          <Pill tone={final ? "good" : "warn"}>{final ? "Final" : "Draft"}</Pill>
        </div>
        <div className="my-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <StatCard label="Members paid" value={`${r.paidCount} of ${r.memberCount}`} />
          <StatCard label="Deposits received" value={$(r.deposits)} />
          <StatCard label="Expenses" value={`−\u00a0${$(r.expenseTotal)}`} />
          <StatCard label="Income" value={`+\u00a0${$(r.incomeTotal)}`} />
        </div>
        <Line label="Opening cash" value={$(r.opening)} />
        <Line label="+ Deposits approved" value={$(r.deposits)} />
        {r.income.map((i) => <Line key={i.id} label={`+ ${INCOME_LABELS[i.kind]}: ${i.description}`} value={$(i.amount)} />)}
        {r.expenses.map((e) => <Line key={e.id} label={`− ${CATEGORY_LABELS[e.category]}: ${e.description}`} value={`−\u00a0${$(e.amount)}`} />)}
        {r.started.map((i) => <Line key={i.id} label={`− Invested: ${i.name}`} value={`−\u00a0${$(i.amount)}`} />)}
        {r.closed.map((i) => <Line key={i.id} label={`+ Returned: ${i.name}`} value={$(i.returnedAmount ?? 0)} />)}
        {r.payouts.map((w) => <Line key={w.id} label={`− Payout: ${w.member.name}`} value={`−\u00a0${$(w.payable ?? 0)}`} />)}
        <Line label="Closing cash" value={$(r.closing)} total />
        {r.owing.length > 0 && <p className="mt-3 text-[13px] text-muted">Not paid for this month: {r.owing.map((m) => m.name).join(", ")}.</p>}
      </Card>
      <Actions
        csv={`/admin/report/csv?type=month&month=${month}`}
        share={{ title, body: `Opening cash ${$(r.opening)}. Deposits ${$(r.deposits)} from ${r.paidCount} of ${r.memberCount} members, income ${$(r.incomeTotal)}, expenses ${$(r.expenseTotal)}. Closing cash ${$(r.closing)}.${final ? "" : " (Draft: the month isn't closed yet.)"}` }}
      />
    </>
  );
}

async function AnnualReport({ year, years, $ }: { year: string; years: string[]; $: Money }) {
  const r = await periodReport(new Date(Number(year), 0, 1), new Date(Number(year), 11, 31, 23, 59, 59, 999));
  const title = `Annual summary · ${year}`;
  const closedCount = await prisma.monthClose.count({ where: { month: { startsWith: year } } });
  return (
    <>
      <Picker type="year" name="year" value={year} options={years.map((y) => [y, y])} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-extrabold">{title}</h2>
            <p className="text-[13px] text-muted">{closedCount} month{closedCount === 1 ? "" : "s"} closed</p>
          </div>
          <Pill tone={closedCount >= 12 ? "good" : "warn"}>{closedCount >= 12 ? "Final" : "Draft"}</Pill>
        </div>
        <div className="my-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <StatCard label="Deposits" value={$(r.deposits)} />
          <StatCard label="Expenses" value={`−\u00a0${$(r.expenseTotal)}`} />
          <StatCard label="Income & profit" value={`+\u00a0${$(r.incomeTotal)}`} />
          <StatCard label="Invested" value={$(r.invested)} />
        </div>
        <Line label={`Cash on 1 Jan ${year}`} value={$(r.opening)} />
        <Line label="+ Deposits approved" value={$(r.deposits)} />
        <Line label="+ Income and investment profit" value={$(r.incomeTotal)} />
        <Line label="+ Investments returned" value={$(r.returned)} />
        <Line label="− Expenses" value={`−\u00a0${$(r.expenseTotal)}`} />
        <Line label="− Newly invested" value={`−\u00a0${$(r.invested)}`} />
        <Line label="− Paid to members who left" value={`−\u00a0${$(r.payoutTotal)}`} />
        <Line label={`Cash at year end${Number(year) === new Date().getFullYear() ? " (so far)" : ""}`} value={$(r.closing)} total />
      </Card>
      <Actions
        csv={`/admin/report/csv?type=year&year=${year}`}
        share={{ title, body: `Deposits ${$(r.deposits)}, income ${$(r.incomeTotal)}, expenses ${$(r.expenseTotal)}, invested ${$(r.invested)}. Cash ${$(r.closing)}.` }}
      />
    </>
  );
}

async function MemberReport({ memberId, members, $ }: { memberId: string; members: Array<{ id: string; name: string; memberNo: number | null }>; $: Money }) {
  if (!memberId) return <Card><Empty>No members yet.</Empty></Card>;
  const { member, position, fund } = await memberStatement(memberId);
  return (
    <>
      <Picker type="member" name="member" value={memberId} options={members.map((m) => [m.id, `${m.memberNo != null ? `#${String(m.memberNo).padStart(2, "0")} ` : ""}${m.name}`])} />
      <Card>
        <h2 className="text-[22px] font-extrabold">Member statement · {member.name}</h2>
        <p className="mb-4 text-[13px] text-muted">{member.phone} · since {monthLabel(member.joinMonth)} · as of today</p>
        <Line label={`Approved deposits (${member.payments.length} payments)`} value={$(position.deposits)} />
        {position.withdrawn > 0 && <Line label="− Withdrawn" value={`−\u00a0${$(position.withdrawn)}`} tone="bad" />}
        <Line label={`+ Profit share (1/${fund.activeMembers})`} value={`+\u00a0${$(position.profitShare)}`} tone="good" />
        <Line label={`− Cost share (1/${fund.activeMembers})`} value={`−\u00a0${$(position.costShare)}`} tone="bad" />
        <Line label="Net value" value={$(position.net)} total />
        <div className="mt-5 -mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold text-muted">
                <th className="px-4 py-2 sm:px-2">Month</th>
                <th className="px-2 py-2">Receipt</th>
                <th className="px-2 py-2">Paid on</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {member.payments.map((p) => (
                <tr key={p.id} className="border-b border-[#EFEDE6]">
                  <td className="px-4 py-2 sm:px-2">{monthLabel(p.forMonth)}{p.monthsCount > 1 && ` +${p.monthsCount - 1}`}</td>
                  <td className="px-2 py-2">{p.receiptNo ?? "—"}</td>
                  <td className="px-2 py-2">{fmtDay(p.paidOn)}</td>
                  <td className="px-2 py-2 text-right font-bold">{$(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Actions csv={`/admin/report/csv?type=member&member=${memberId}`} />
    </>
  );
}

async function AuditReport({ month, options }: { month: string; options: string[] }) {
  const [y, m] = month.split("-").map(Number);
  const entries = await prisma.auditLog.findMany({
    where: { createdAt: { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <Picker type="audit" name="month" value={month} options={options.map((o) => [o, monthLabel(o, "long")])} />
      <Card title={`Audit log · ${monthLabel(month, "long")}`} action={<span className="text-[13px] text-muted">{entries.length} entries · can&apos;t be edited or deleted</span>}>
        {entries.length === 0 ? (
          <Empty>Nothing recorded this month.</Empty>
        ) : (
          <ul className="flex flex-col">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-[#EFEDE6] py-2.5 text-sm last:border-0">
                <span>{e.detail}</span>
                <span className="text-xs text-muted">{fmtDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Actions csv={`/admin/report/csv?type=audit&month=${month}`} />
    </>
  );
}

async function GridReport({ $ }: { $: Money }) {
  const { months, members, fund } = await buildReport();
  return (
    <>
      <Card title="Deposits by month">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted">
                <th className="sticky left-0 bg-white px-4 py-2 text-left font-bold sm:px-2">Member</th>
                {months.map((m) => <th key={m} className="whitespace-nowrap px-1 py-2 font-bold">{monthLabel(m).replace(" 20", " '")}</th>)}
                <th className="px-2 py-2 text-right font-bold">Due</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-[#EFEDE6]">
                  <td className="sticky left-0 whitespace-nowrap bg-white px-4 py-1.5 sm:px-2">
                    <Link href={`/admin/members/${m.id}`} className="font-bold text-ink">{m.name}</Link>
                  </td>
                  {months.map((month) => {
                    const s = m.ledger.statusFor(month);
                    return (
                      <td key={month} className="px-0.5 py-1">
                        <div className={`mx-auto w-8 rounded py-1 text-center font-bold ${CELL[s]}`}>{CELL_MARK[s]}</div>
                      </td>
                    );
                  })}
                  <td className={`px-2 py-1.5 text-right font-bold ${m.ledger.due > 0 ? "text-bad" : "text-muted"}`}>{m.ledger.due > 0 ? $(m.ledger.due) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MonthLegend />
        <p className="mt-2 text-xs text-muted">{fund.activeMembers} members · cost share {$(fund.expenseSharePerMember)} · profit share {$(fund.profitSharePerMember)} each.</p>
      </Card>
      <Actions csv="/admin/report/csv?type=grid" />
    </>
  );
}

