import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, memberPosition } from "@/lib/society";
import { openAccounts } from "@/lib/books";
import { pii } from "@/lib/crypto";
import { dateInput, fmtDate } from "@/lib/format";
import { fileUrl } from "@/lib/uploads";
import { ActionForm } from "@/components/ActionForm";
import { AccountSelect } from "@/components/AccountSelect";
import { PayoutReceipt } from "@/components/PayoutReceipt";
import { ReceiptActions } from "@/components/ReceiptActions";
import { Badge, Card, Line, Notice, PageHeader, inputClass, labelClass, primaryButton, secondaryButton, smallSecondary } from "@/components/ui";
import { LandTimingField } from "./LandTimingField";
import { approveWithdrawal, confirmForNominee, declineWithdrawal, payOwedLandShare, recordPayout, reopenWithdrawal } from "../actions";

const TITLE = { FULL: "Full exit", PARTIAL: "Partial withdrawal", NOMINEE: "Settlement to nominee", LAND_SHARE: "Owed land share" };

export default async function WithdrawalPage({ params }: PageProps<"/admin/withdrawals/[id]">) {
  const viewer = await requireStaff();
  const canEdit = viewer.role === "ADMIN";
  const { id } = await params;
  const [settings, w, fund, accounts] = await Promise.all([
    getSettings(),
    prisma.withdrawal.findUnique({ where: { id }, include: { member: true, receipt: true } }),
    fundSummary(),
    openAccounts(),
  ]);
  if (!w) notFound();
  const member = pii(w.member);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const pos = await memberPosition(w.memberId, fund);
  const firstName = w.firstApprover ? (await prisma.user.findUnique({ where: { id: w.firstApprover } }))?.name : null;
  const landChild = await prisma.withdrawal.findFirst({ where: { parentId: w.id, kind: "LAND_SHARE", status: { notIn: ["DECLINED", "CANCELLED"] } } });
  const needsSecond = settings.dualApprovalLimit != null && (w.kind === "PARTIAL" || w.kind === "LAND_SHARE" ? (w.amount ?? 0) : pos.net) > settings.dualApprovalLimit;
  const estimate = w.kind === "PARTIAL" || w.kind === "LAND_SHARE" ? (w.amount ?? 0) : pos.net;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${TITLE[w.kind]} · ${member.name}`}
        subtitle={`Requested ${fmtDate(w.createdAt)}${w.reason ? ` · reason: “${w.reason}”` : ""}${w.eraseData ? " · asked to delete their account" : ""}`}
        back={{ href: "/admin/members", label: "Members" }}
        action={<Badge label={w.status} />}
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
          {w.status === "PENDING" && (
            <Card title="Settlement (estimate until approved)">
              {w.kind === "PARTIAL" || w.kind === "LAND_SHARE" ? (
                <>
                  <Line label="Requested" value={$(w.amount ?? 0)} />
                  {w.kind === "PARTIAL" && <Line label="Member's current net value" value={$(pos.net)} />}
                  <Line label="Payable" value={$(w.amount ?? 0)} total />
                </>
              ) : (
                <>
                  <Line label={`Approved deposits${pos.withdrawn ? " (less earlier withdrawals)" : ""}`} value={$(pos.deposits - pos.withdrawn)} />
                  <Line label="+ Profit share (shares of profit dated while a member)" value={`+ ${$(pos.profitShare)}`} tone="good" />
                  <Line label="− Cost share (shares of costs dated while a member)" value={`− ${$(pos.costShare)}`} tone="bad" />
                  <Line label="+ Land gain share (estimate, 1 / members)" value={`${$(pos.landShare)}`} />
                  <Line label="Payable now (without land share)" value={$(pos.net)} total />
                </>
              )}
              <p className="mt-3 text-[13px] text-muted">
                Cash available {$(fund.cash)} — {fund.cash >= estimate ? "enough to pay." : "not enough yet (BR-07 blocks the approval)."} Funds in land and business stay invested.
              </p>
              {needsSecond && <Notice tone="warn">Above the society&apos;s limit of {$(settings.dualApprovalLimit!)}: two different admins must approve.{firstName && ` ${firstName} has approved; a second admin must confirm.`}</Notice>}
              {w.attachmentPath && <a href={fileUrl(w.attachmentPath)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] font-bold">Death certificate</a>}
            </Card>
          )}

          {w.status === "PENDING" && canEdit && (
            <div className="flex flex-wrap gap-4">
              <Card title={w.firstApprover ? "Second approval" : "Approve"} className="flex-[2_1_320px]">
                <ActionForm action={approveWithdrawal.bind(null, w.id)} submitLabel={w.firstApprover ? "Confirm as second admin" : "Approve & freeze figures"} resetOnSuccess={false}>
                  {(w.kind === "FULL" || w.kind === "NOMINEE") && <LandTimingField estimate={$(pos.landShare)} />}
                  {w.kind === "NOMINEE" && <Notice tone="warn">Check the nominee&apos;s identity ({member.nomineeName}, NID ending {member.nomineeNid?.slice(-4) ?? "—"}) before approving.</Notice>}
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
            <Card
              title={`Approved by ${w.approvedBy ?? "—"} · pay ${$(w.payable ?? 0)} to ${w.payTo}`}
              action={canEdit && <ActionForm action={reopenWithdrawal.bind(null, w.id)} submitLabel="Undo approval" buttonClass={smallSecondary} className="flex"><span className="sr-only">Undo</span></ActionForm>}
            >
              {canEdit && (
                <ActionForm action={recordPayout.bind(null, w.id)} submitLabel="Record payout & issue receipt">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label htmlFor="reference" className={labelClass}>Transaction ID</label>
                      <input id="reference" name="reference" required className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="paidOn" className={labelClass}>Paid on</label>
                      <input id="paidOn" name="paidOn" type="date" defaultValue={dateInput()} max={dateInput()} className={inputClass} />
                    </div>
                    <AccountSelect accounts={accounts} label="Paid from" id="payout-account" />
                  </div>
                </ActionForm>
              )}
            </Card>
          )}

          {(w.status === "APPROVED" || w.status === "PAID") && (
            <div className="flex max-w-md flex-col gap-3">
              <PayoutReceipt withdrawal={w} member={w.member} settings={settings} />
              {w.receipt && <ReceiptActions title={`${settings.societyName} payout ${w.receipt.receiptNo}`} receiptNo={w.receipt.receiptNo} />}
              {canEdit && w.status === "PAID" && w.kind === "NOMINEE" && !w.memberConfirmedAt && (
                <form action={confirmForNominee.bind(null, w.id)}><button className={`w-full ${primaryButton}`}>Nominee confirmed receipt</button></form>
              )}
              {w.status === "PAID" && w.landTiming === "ON_SALE" && (w.landShare ?? 0) > 0 && (
                <Card title="Land share owed">
                  {landChild ? (
                    <p className="text-sm">Being paid: <Link href={`/admin/withdrawals/${landChild.id}`}>{landChild.status === "PAID" ? "paid" : "open"} →</Link></p>
                  ) : canEdit ? (
                    <ActionForm action={payOwedLandShare.bind(null, w.id)} submitLabel={`Land sold: pay ${$(w.landShare ?? 0)}`} buttonClass={secondaryButton}>
                      <p className="text-[13px] text-muted">Still owed to {member.name} until the land is sold. Once it is, open the payout here.</p>
                    </ActionForm>
                  ) : (
                    <p className="text-sm text-muted">Still owed until the land is sold.</p>
                  )}
                </Card>
              )}
            </div>
          )}

          {(w.status === "DECLINED" || w.status === "CANCELLED") && <Card><p className="text-sm text-muted">{w.status === "DECLINED" ? `Declined: ${w.adminNote}` : "Cancelled."}</p></Card>}
        </div>

        <Card title="Member" className="flex-[1_1_260px]">
          <div className="flex flex-col gap-1 text-sm">
            <Link href={`/admin/members/${w.memberId}`} className="font-bold">{member.name}</Link>
            <span className="text-muted">{member.phone}</span>
            <span className="text-muted">Send money to: <strong className="text-ink">{w.payTo}</strong></span>
            {member.nomineeName && <span className="text-muted">Nominee: {member.nomineeName}{member.nomineeRelation && ` (${member.nomineeRelation})`}</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
