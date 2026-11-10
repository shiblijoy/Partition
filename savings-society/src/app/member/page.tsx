import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { ledgerFor, memberPosition } from "@/lib/society";
import { currentMonth } from "@/lib/months";
import { tFor, monthName, dateName } from "@/lib/i18n";
import { Icon } from "@/components/icons";
import { Badge, METHOD_LABELS, darkButton } from "@/components/ui";

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export default async function MemberHome() {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const lang = viewer.language;
  const settings = await getSettings();
  const [member, latest, recent, unreadNotices, unreadNotes, ledger, position, payout] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: viewer.userId } }),
    prisma.payment.findFirst({ where: { memberId: viewer.userId }, orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({ where: { memberId: viewer.userId, status: "APPROVED" }, orderBy: [{ reviewedAt: "desc" }, { forMonth: "desc" }], take: 3 }),
    prisma.notice.count({ where: { reads: { none: { userId: viewer.userId } } } }),
    prisma.notification.count({ where: { userId: viewer.userId, readAt: null } }),
    ledgerFor(viewer.userId, settings),
    memberPosition(viewer.userId),
    prisma.withdrawal.findFirst({ where: { memberId: viewer.userId, status: "PAID", memberConfirmedAt: null }, orderBy: { paidAt: "desc" } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const now = currentMonth();
  const unread = unreadNotices + unreadNotes;
  const latestBatch = latest?.batchId ? await prisma.payment.count({ where: { batchId: latest.batchId } }) : 1;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] font-medium text-muted">{settings.societyName}</div>
          <div className="text-[22px] font-bold">{t("Hi, {name}", { name: member.name.split(" ")[0] })}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/member/notifications"
            aria-label={unread ? t("Notifications, {n} unread", { n: unread }) : t("Notifications")}
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink"
          >
            <Icon name="bell" />
            {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[#D9822B] ring-2 ring-white" />}
          </Link>
          <Link href="/member/profile" aria-label={t("My profile")} className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-[15px] font-bold text-white no-underline">
            {initials(member.name)}
          </Link>
        </div>
      </div>

      {payout && (
        <Link href={`/member/payouts/${payout.id}`} className="rounded-2xl border-2 border-brand bg-white p-4 text-sm font-bold text-ink no-underline">
          {t("Your payout has been sent. Open the receipt and confirm you received it →")}
        </Link>
      )}

      <div className="flex flex-col gap-3.5 rounded-[20px] bg-brand p-5 text-white">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] text-brand-soft">{t("My approved savings")}</div>
          <div className="text-[34px] font-extrabold tracking-tight">{$(position.deposits)}</div>
          <div className="text-[13px] text-brand-soft">
            {t("{paid} of {owed} months approved · since {month}", { paid: ledger.monthsPaid, owed: ledger.monthsOwed, month: monthName(ledger.firstMonth, lang) })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5 border-t border-[#3E8370] pt-3.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-brand-soft">{t("Profit share")}</div>
            <div className="text-base font-bold">+&nbsp;{$(position.profitShare)}</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-brand-soft">{t("Cost share")}</div>
            <div className="text-base font-bold">−&nbsp;{$(position.costShare)}</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-brand-soft">{t("Net value")}</div>
            <div className="text-base font-bold">{$(position.net)}</div>
          </div>
        </div>
      </div>

      {latest && latest.status !== "APPROVED" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="text-[15px] font-bold">{monthName(latest.forMonth, lang, "long")}{latestBatch > 1 && ` + ${latestBatch - 1}`}</div>
              <div className="text-[13px] text-muted">{t("submitted {date}", { date: dateName(latest.createdAt, lang, false) })}</div>
            </div>
            <Badge label={latest.status} lang={lang} />
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            {latest.status === "PENDING"
              ? t("Your proof is with the admin. It will be approved once the money shows in the society account.")
              : latest.status === "REVERSED"
                ? t("Admin reversed this approval: {reason}. The month is due again.", { reason: latest.reversalReason ?? "" })
                : t("Admin: {reason}. Please pay again or resubmit with a clearer proof.", { reason: latest.reviewNote ?? t("rejected") })}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex flex-col gap-0.5">
            <div className="text-[15px] font-bold">{monthName(now, lang, "long")}</div>
            <div className="text-[13px] text-muted">
              {ledger.due > 0 ? t("{amount} due by the {day}th", { amount: $(ledger.due), day: settings.reminderDay }) : t("Nothing due right now")}
            </div>
          </div>
          {ledger.due > 0 ? <Badge label="DUE" lang={lang} /> : <Badge label="APPROVED" lang={lang} />}
        </div>
      )}

      {!viewer.readOnly && (
        <Link href="/member/pay" className={`${darkButton} no-underline`}>
          <Icon name="upload" />
          {t("Upload payment proof")}
        </Link>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">{t("Recent payments")}</h2>
          <Link href="/member/history" className="py-2 text-[13px] font-semibold">{t("See all")}</Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">{t("No approved payments yet.")}</p>
        ) : (
          recent.map((p) => (
            <Link key={p.id} href={`/member/receipts/${p.id}`} className="flex items-center justify-between rounded-xl border border-line bg-white px-3.5 py-3 text-ink no-underline">
              <div className="flex flex-col gap-0.5">
                <div className="text-sm font-semibold">{monthName(p.forMonth, lang, "long")}</div>
                <div className="text-xs text-muted">
                  {t(METHOD_LABELS[p.method])} · {t("approved {date}", { date: p.reviewedAt ? dateName(p.reviewedAt, lang, false) : "" })}
                </div>
              </div>
              <Badge label="APPROVED" lang={lang} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
