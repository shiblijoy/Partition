import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { memberPosition } from "@/lib/society";
import { tFor, dateName } from "@/lib/i18n";
import { Badge, Line, Notice, ScreenHeader, secondaryButton } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { WithdrawForm } from "./WithdrawForm";
import { cancelWithdrawal } from "./actions";

export default async function WithdrawPage() {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const lang = viewer.language;
  const [settings, open, member, position] = await Promise.all([
    getSettings(),
    prisma.withdrawal.findFirst({ where: { memberId: viewer.userId, status: { in: ["PENDING", "APPROVED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.user.findUniqueOrThrow({ where: { id: viewer.userId } }),
    memberPosition(viewer.userId),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);

  if (open) {
    const steps: Array<[boolean, React.ReactNode]> = [
      [true, t("Request sent · {date}", { date: dateName(open.createdAt, lang, false) })],
      [open.status === "APPROVED", open.status === "APPROVED" ? t("Admin approved · {amount}", { amount: open.payable != null ? $(open.payable) : "" }) : open.firstApprover ? t("First admin approved · waiting for a second admin") : t("Admin checks settlement")],
      [false, <>{t("Money sent · you confirm on the")} <Link href={`/member/payouts/${open.id}`} className="font-bold">{t("payout receipt")}</Link></>],
    ];
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title={t("Withdraw from society")} back="/member/history" />
        <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-[18px]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">
              {open.eraseData ? t("Account deletion requested") : open.kind === "FULL" ? t("Exit request sent") : t("Partial withdrawal · {amount}", { amount: $(open.amount ?? 0) })}
            </h2>
            <Badge label={open.status} lang={lang} />
          </div>
          <ol className="flex flex-col gap-3 text-sm">
            {steps.map(([done, label], i) => (
              <li key={i} className="flex items-center gap-2.5">
                <span className={`h-[22px] w-[22px] shrink-0 rounded-full ${done ? "bg-brand" : "border-2 border-[#B9B5A7]"}`} />
                <span className={done ? "font-bold" : ""}>{label}</span>
              </li>
            ))}
          </ol>
          <p className="text-[13px] leading-relaxed text-muted">
            {open.kind === "FULL" ? `${t("Keep paying monthly until the admin approves.")} ` : ""}
            {open.status === "PENDING" ? t("You can cancel any time before that.") : t("The admin will send the money and issue a payout receipt.")}
          </p>
        </div>
        {open.status === "PENDING" && !viewer.readOnly && (
          <ConfirmButton action={cancelWithdrawal.bind(null, open.id)} confirmText={t("Cancel this request?")} className={`w-full text-bad ${secondaryButton}`}>
            {t("Cancel request")}
          </ConfirmButton>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title={t("Withdraw from society")} back="/member/history" />
      <div className="flex flex-col rounded-2xl border border-line bg-white px-4 py-3.5">
        <h2 className="pb-1.5 text-[13px] font-bold">{t("Estimated settlement if you leave")}</h2>
        <Line label={t("My deposits")} value={$(position.deposits)} />
        {position.withdrawn > 0 && <Line label={t("− Already withdrawn")} value={`− ${$(position.withdrawn)}`} tone="bad" />}
        <Line label={t("− Cost share")} value={`− ${$(position.costShare)}`} tone="bad" />
        <Line label={t("Deposits after costs")} value={$(position.afterCosts)} total />
        <p className="pt-1.5 text-xs leading-snug text-muted">
          {t("The admin works out your final amount, including any profit share, when they approve the request.")}
        </p>
      </div>
      {viewer.readOnly ? <Notice tone="neutral">{t("Your membership has ended, so your account is read-only.")}</Notice> : <WithdrawForm defaultPayTo={member.phone} currency={settings.currencySymbol} />}
    </div>
  );
}
