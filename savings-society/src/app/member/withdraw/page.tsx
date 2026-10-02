import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, memberPosition } from "@/lib/society";
import { fmtDay } from "@/lib/format";
import { Badge, Line, ScreenHeader, secondaryButton } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { WithdrawForm } from "./WithdrawForm";
import { cancelWithdrawal } from "./actions";

export default async function WithdrawPage() {
  const session = await requireMember();
  const [settings, fund, open, member] = await Promise.all([
    getSettings(),
    fundSummary(),
    prisma.withdrawal.findFirst({ where: { memberId: session.userId, status: { in: ["PENDING", "APPROVED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
  ]);
  const position = await memberPosition(session.userId, fund);
  const $ = (n: number) => money(n, settings.currencySymbol);

  if (open) {
    const steps: Array<[boolean, React.ReactNode]> = [
      [true, `Request sent · ${fmtDay(open.createdAt)}`],
      [open.status === "APPROVED", open.status === "APPROVED" ? `Admin approved · ${open.payable != null ? $(open.payable) : ""}` : "Admin checks settlement"],
      [
        false,
        <>
          Money sent · you confirm on the{" "}
          <Link href={`/member/payouts/${open.id}`} className="font-bold">payout receipt</Link>
        </>,
      ],
    ];
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Withdraw from society" back="/member/history" />
        <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-[18px]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">
              {open.eraseData ? "Account deletion requested" : open.kind === "FULL" ? "Exit request sent" : `Partial withdrawal · ${$(open.amount ?? 0)}`}
            </h2>
            <Badge label={open.status === "PENDING" ? "PENDING" : "APPROVED"} />
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
            {open.kind === "FULL" ? "Keep paying monthly until the admin approves. " : ""}
            {open.status === "PENDING" ? "You can cancel any time before that." : "The admin will send the money and issue a payout receipt."}
          </p>
        </div>
        {open.status === "PENDING" && (
          <ConfirmButton action={cancelWithdrawal.bind(null, open.id)} confirmText="Cancel this request?" className={`w-full text-bad ${secondaryButton}`}>
            Cancel request
          </ConfirmButton>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Withdraw from society" back="/member/history" />
      <div className="flex flex-col rounded-2xl border border-line bg-white px-4 py-3.5">
        <h2 className="pb-1.5 text-[13px] font-bold">Estimated settlement if you leave</h2>
        <Line label="My deposits" value={$(position.deposits)} />
        {position.withdrawn > 0 && <Line label="− Already withdrawn" value={`−\u00a0${$(position.withdrawn)}`} tone="bad" />}
        <Line label="+ Profit share" value={`+\u00a0${$(position.profitShare)}`} tone="good" />
        <Line label="− Cost share" value={`−\u00a0${$(position.costShare)}`} tone="bad" />
        <Line label="You receive" value={$(position.net)} total />
        {position.landShare > 0 && (
          <p className="pt-1.5 text-xs leading-snug text-muted">
            Plus your share of land and share gains (about {$(position.landShare)}), decided by the admin: paid now or when the asset is sold.
          </p>
        )}
      </div>
      <WithdrawForm defaultPayTo={member.phone} currency={settings.currencySymbol} />
    </div>
  );
}
