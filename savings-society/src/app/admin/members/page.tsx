import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { membersWithLedgers } from "@/lib/society";
import { currentMonth, monthLabel, monthRange } from "@/lib/months";
import { fmtDay } from "@/lib/format";
import { Card, Empty, PageHeader, Pill, inputClass, type Tone } from "@/components/ui";
import { AddMemberForm } from "./AddMemberForm";

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  const { q } = await searchParams;
  const query = String(q ?? "").trim().toLowerCase();
  const settings = await getSettings();
  const [members, open] = await Promise.all([
    membersWithLedgers(settings, { includeInactive: true }),
    prisma.withdrawal.findMany({ where: { status: { in: ["PENDING", "APPROVED"] } }, include: { member: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const exiting = new Set(open.map((w) => w.memberId));
  const current = members.filter((m) => m.active && !m.exit);
  const shown = members.filter((m) => !query || m.name.toLowerCase().includes(query) || m.phone.includes(query));
  const catchUpTotal = monthRange(settings.startMonth, currentMonth()).length * settings.monthlyAmount;

  const status = (m: (typeof members)[number]): [Tone, string] => {
    if (m.exit === "LEFT") return ["neutral", "Left"];
    if (m.exit === "REMOVED") return ["bad", "Removed"];
    if (m.exit === "DECEASED" || (!m.active && !m.exit)) return ["neutral", m.active ? "Inactive" : "Deceased"];
    if (exiting.has(m.id)) return ["warn", "Exiting"];
    if (m.ledger.due > settings.monthlyAmount) return ["bad", "Behind"];
    return ["good", "Active"];
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Members" subtitle={`${current.length} active · ${members.length - current.length} left`} back={{ href: "/admin", label: "Dashboard" }} />

      {open.length > 0 && (
        <Card title="Withdrawal requests">
          <ul className="flex flex-col">
            {open.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEDE6] py-3 last:border-0">
                <div>
                  <div className="font-bold">{w.member.name}</div>
                  <div className="text-[13px] text-muted">
                    {w.kind === "FULL" ? (w.exitAs === "REMOVED" ? "Removal" : "Full exit") : w.kind === "NOMINEE" ? "Settlement to nominee" : `Partial · ${$(w.amount ?? 0)}`} · requested {fmtDay(w.createdAt)}
                    {w.reason && ` · “${w.reason}”`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Pill tone="warn">{w.status === "PENDING" ? "Waiting for admin" : `Approved · ${$(w.payable ?? 0)}`}</Pill>
                  <Link href={`/admin/withdrawals/${w.id}`} className="text-[13px] font-bold">Open settlement →</Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <Card
          title="All members"
          className="min-w-0 flex-[3_1_600px]"
          action={
            <form className="flex gap-2" role="search">
              <input name="q" defaultValue={query} aria-label="Search members" placeholder="Search name or number" className={`${inputClass} mt-0 h-10 w-56`} />
            </form>
          }
        >
          {shown.length === 0 ? (
            <Empty>No members{query && " match that search"}.</Empty>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-bold text-muted">
                    <th className="px-4 py-2.5 sm:px-2">Member</th>
                    <th className="px-2 py-2.5">Joined</th>
                    <th className="px-2 py-2.5">Paid</th>
                    <th className="px-2 py-2.5 text-right">Deposits</th>
                    <th className="px-2 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => {
                    const [tone, label] = status(m);
                    const gone = !!m.exit || !m.active;
                    return (
                      <tr key={m.id} className={`border-b border-[#EFEDE6] ${gone ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3 sm:px-2">
                          <Link href={`/admin/members/${m.id}`} className="font-bold text-ink">
                            {m.memberNo != null && <span className="text-muted">#{String(m.memberNo).padStart(2, "0")} </span>}
                            {m.name}
                          </Link>
                          <div className="text-xs text-muted">{m.phone}{m.pendingCount > 0 && <span className="text-warn"> · {m.pendingCount} pending</span>}</div>
                        </td>
                        <td className="px-2 py-3 text-muted">{monthLabel(m.joinMonth)}</td>
                        <td className="px-2 py-3">
                          {Math.floor(m.ledger.paid / settings.monthlyAmount + 1e-9)} / {m.ledger.monthsOwed}
                          {m.ledger.due > 0 && !gone && <span className="text-bad"> · owes {$(m.ledger.due)}</span>}
                        </td>
                        <td className="px-2 py-3 text-right font-bold">{$(m.ledger.paid)}</td>
                        <td className="px-2 py-3"><Pill tone={tone}>{label}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Open a member to record a payment, reset their password, or remove them (removing creates a settlement like a withdrawal).</p>
        </Card>

        <Card title="Add member" className="flex-[1_1_320px]">
          <AddMemberForm thisMonth={currentMonth()} catchUpLabel={$(catchUpTotal)} startLabel={monthLabel(settings.startMonth)} />
        </Card>
      </div>
    </div>
  );
}
