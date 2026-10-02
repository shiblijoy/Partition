import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { fundSummary, memberPosition } from "@/lib/society";
import { currentMonth, monthLabel } from "@/lib/months";
import { fmtDay } from "@/lib/format";
import { Icon } from "@/components/icons";
import { Badge, METHOD_LABELS, darkButton } from "@/components/ui";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function MemberHome() {
  const session = await requireMember();
  const [settings, member, fund, latest, recent, unread] = await Promise.all([
    getSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    fundSummary(),
    prisma.payment.findFirst({ where: { memberId: session.userId }, orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({
      where: { memberId: session.userId, status: "APPROVED" },
      orderBy: { reviewedAt: "desc" },
      take: 3,
    }),
    prisma.notice.count({ where: { reads: { none: { userId: session.userId } } } }),
  ]);
  if (member.exit) {
    // Settled out: all that's left is confirming the payout.
    const payout = await prisma.withdrawal.findFirst({ where: { memberId: member.id, status: "PAID" }, orderBy: { paidAt: "desc" } });
    if (payout) redirect(`/member/payouts/${payout.id}`);
  }
  const position = await memberPosition(member.id, fund);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const ledger = memberLedger(member, position.deposits, settings);
  const monthsPaid = settings.monthlyAmount > 0 ? Math.floor(position.deposits / settings.monthlyAmount + 1e-9) : 0;
  const now = currentMonth();

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] font-medium text-muted">{settings.societyName}</div>
          <div className="text-[22px] font-bold">Hi, {member.name.split(" ")[0]}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/member/notices"
            aria-label={unread ? `Notices, ${unread} unread` : "Notices"}
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink"
          >
            <Icon name="bell" />
            {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[#D9822B] ring-2 ring-white" />}
          </Link>
          <Link
            href="/member/profile"
            aria-label="My profile"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-[15px] font-bold text-white no-underline"
          >
            {initials(member.name)}
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 rounded-[20px] bg-brand p-5 text-white">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] text-brand-soft">My approved savings</div>
          <div className="text-[34px] font-extrabold tracking-tight">{$(position.deposits)}</div>
          <div className="text-[13px] text-brand-soft">
            {monthsPaid} of {ledger.monthsOwed} months approved · since {monthLabel(ledger.firstMonth)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 border-t border-[#3E8370] pt-3.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-brand-soft">My share of costs</div>
            <div className="text-base font-bold">−&nbsp;{$(position.costShare)}</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-brand-soft">Net value</div>
            <div className="text-base font-bold">{$(position.net)}</div>
          </div>
        </div>
      </div>

      {latest && latest.status !== "APPROVED" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="text-[15px] font-bold">{monthLabel(latest.forMonth, "long")}{latest.monthsCount > 1 && ` + ${latest.monthsCount - 1} more`}</div>
              <div className="text-[13px] text-muted">{$(latest.amount)} · submitted {fmtDay(latest.createdAt)}</div>
            </div>
            {latest.status === "PENDING" ? <Badge label="PENDING" /> : <Badge label="REJECTED" />}
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            {latest.status === "PENDING"
              ? "Your proof is with the admin. It will be approved once the money shows in the society account."
              : `Admin: ${latest.reviewNote ?? "rejected"}. Please pay again or resubmit with a clearer proof.`}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex flex-col gap-0.5">
            <div className="text-[15px] font-bold">{monthLabel(now, "long")}</div>
            <div className="text-[13px] text-muted">
              {ledger.due > 0 ? `${$(ledger.due)} due by ${settings.reminderDay} ${monthLabel(now).split(" ")[0]}` : "Nothing due right now"}
            </div>
          </div>
          {ledger.due > 0 ? <Badge label="OPEN" /> : <Badge label="APPROVED" />}
        </div>
      )}

      <Link href="/member/pay" className={`${darkButton} no-underline`}>
        <Icon name="upload" />
        Upload payment proof
      </Link>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">Recent payments</h2>
          <Link href="/member/history" className="py-2 text-[13px] font-semibold">See all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">No approved payments yet.</p>
        ) : (
          recent.map((p) => (
            <Link
              key={p.id}
              href={`/member/receipts/${p.id}`}
              className="flex items-center justify-between rounded-xl border border-line bg-white px-3.5 py-3 text-ink no-underline"
            >
              <div className="flex flex-col gap-0.5">
                <div className="text-sm font-semibold">{monthLabel(p.forMonth, "long")}{p.monthsCount > 1 && ` + ${p.monthsCount - 1}`}</div>
                <div className="text-xs text-muted">
                  {METHOD_LABELS[p.method]} · approved {p.reviewedAt ? fmtDay(p.reviewedAt) : ""}
                </div>
              </div>
              <Badge label="APPROVED" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
