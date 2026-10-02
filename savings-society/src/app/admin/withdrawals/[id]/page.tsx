import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, memberPosition } from "@/lib/society";
import { dateInput, fmtDate } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PayoutReceipt } from "@/components/PayoutReceipt";
import { Badge, Card, Line, Notice, PageHeader, inputClass, labelClass, primaryButton, secondaryButton, smallSecondary } from "@/components/ui";
import { LandTimingField } from "./LandTimingField";
import { approveWithdrawal, confirmForNominee, declineWithdrawal, recordPayout, reopenWithdrawal } from "../actions";

const TITLE = { FULL: "Full exit", PARTIAL: "Partial withdrawal", NOMINEE: "Settlement to nominee" };

export default async function WithdrawalPage({ params }: PageProps<"/admin/withdrawals/[id]">) {
  const { id } = await params;
  const [settings, w, fund] = await Promise.all([
    getSettings(),
    prisma.withdrawal.findUnique({ where: { id }, include: { member: true } }),
    fundSummary(),
  ]);
  if (!w) notFound();
  const $ = (n: number) => money(n, settings.currencySymbol);
  const pos = await memberPosition(w.memberId, fund);
  const n = fund.activeMembers;
  const payer = await prisma.auditLog.findFirst({ where: { action: "payout.paid", detail: { contains: w.id } }, include: { actor: { select: { name: true } } } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${TITLE[w.kind]} · ${w.member.name}`}
        subtitle={`Requested ${fmtDate(w.createdAt)}${w.reason ? ` · reason: “${w.reason}”` : ""}${w.eraseData ? " · asked to delete their account" : ""}`}
        back={{ href: "/admin/members", label: "Members" }}
        action={<Badge label={w.status} />}
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
          {w.status === "PENDING" && (
            <Card title="Settlement (estimate until approved)">
              {w.kind === "PARTIAL" ? (
                <>
                  <Line label="Requested" value={$(w.amount ?? 0)} />
                  <Line label="Member's current net value" value={$(pos.net)} />
                  <Line label="Payable to member" value={$(w.amount ?? 0)} total />
                </>
              ) : (
                <>
                  <Line label={`Approved deposits${pos.withdrawn ? " (less earlier withdrawals)" : ""}`} value={$(pos.deposits - pos.withdrawn)} />
                  <Line label={`+ Profit share (1/${n} of ${$(fund.totalProfit)})`} value={`+\u00a0${$(pos.profitShare)}`} tone="good" />
                  <Line label={`− Cost share (1/${n} of ${$(fund.totalExpenses)})`} value={`−\u00a0${$(pos.costShare)}`} tone="bad" />
                  <Line label="+ Land gain share (estimate)" value={`${$(pos.landShare)}`} />
                  <Line label="Payable now (without land share)" value={$(pos.net)} total />
                </>
              )}
              <p className="mt-3 text-[13px] text-muted">
                Cash available {$(fund.cash)} — {fund.cash >= (w.kind === "PARTIAL" ? (w.amount ?? 0) : pos.net) ? "enough to pay." : "not enough yet."} Funds in land and business stay invested.
              </p>
              {w.attachmentPath && <a href={fileUrl(w.attachmentPath)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] font-bold">Death certificate</a>}
            </Card>
          )}

          {w.status === "PENDING" && (
            <div className="flex flex-wrap gap-4">
              <Card title="Approve" className="flex-[2_1_320px]">
                <ActionForm action={approveWithdrawal.bind(null, w.id)} submitLabel="Approve & schedule payout" resetOnSuccess={false}>
                  {w.kind !== "PARTIAL" && <LandTimingField estimate={$(pos.landShare)} />}
                  {w.kind === "NOMINEE" && <Notice tone="warn">Check the nominee&apos;s identity against the NID on record before approving.</Notice>}
                </ActionForm>
              </Card>
              <Card title="Decline" className="flex-[1_1_240px]">
                <ActionForm action={declineWithdrawal.bind(null, w.id)} submitLabel="Decline" buttonClass={`${secondaryButton} text-bad`}>
                  <input name="note" required aria-label="Reason for declining" placeholder="Reason, shown to the member" className={inputClass} />
                </ActionForm>
              </Card>
            </div>
          )}

          {w.status === "APPROVED" && (
            <Card title={`Approved · pay ${$(w.payable ?? 0)} to ${w.payTo}`} action={
              <ConfirmButton action={reopenWithdrawal.bind(null, w.id)} confirmText="Undo the approval and recalculate?" className={smallSecondary}>Undo</ConfirmButton>
            }>
              <ActionForm action={recordPayout.bind(null, w.id)} submitLabel="Record payout & send receipt">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reference" className={labelClass}>Transaction ID</label>
                    <input id="reference" name="reference" required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="paidOn" className={labelClass}>Paid on</label>
                    <input id="paidOn" name="paidOn" type="date" defaultValue={dateInput()} max={dateInput()} className={inputClass} />
                  </div>
                </div>
              </ActionForm>
            </Card>
          )}

          {(w.status === "APPROVED" || w.status === "PAID") && (
            <div className="max-w-md">
              <PayoutReceipt withdrawal={w} member={w.member} settings={settings} paidBy={payer?.actor?.name ?? "—"} />
              {w.status === "PAID" && w.kind === "NOMINEE" && !w.memberConfirmedAt && (
                <form action={confirmForNominee.bind(null, w.id)} className="mt-3">
                  <button className={`w-full ${primaryButton}`}>Nominee confirmed receipt</button>
                </form>
              )}
            </div>
          )}

          {(w.status === "DECLINED" || w.status === "CANCELLED") && (
            <Card><p className="text-sm text-muted">{w.status === "DECLINED" ? `Declined: ${w.adminNote}` : "Cancelled."}</p></Card>
          )}
        </div>

        <Card title="Member" className="flex-[1_1_260px]">
          <div className="flex flex-col gap-1 text-sm">
            <Link href={`/admin/members/${w.memberId}`} className="font-bold">{w.member.name}</Link>
            <span className="text-muted">{w.member.phone}</span>
            <span className="text-muted">Send money to: <strong className="text-ink">{w.payTo}</strong></span>
            {w.member.nomineeName && <span className="text-muted">Nominee: {w.member.nomineeName}{w.member.nomineeRelation && ` (${w.member.nomineeRelation})`}</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
