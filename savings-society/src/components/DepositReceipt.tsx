import { prisma } from "@/lib/prisma";
import { money, type Settings } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { addMonths, monthLabel } from "@/lib/months";
import { fmtDate, fmtDateTime, takaInWords } from "@/lib/format";
import { Icon } from "@/components/icons";
import { Field, METHOD_LABELS } from "@/components/ui";
import { ReceiptActions } from "@/components/ReceiptActions";

type ReceiptPayment = NonNullable<Awaited<ReturnType<typeof loadReceipt>>>;

export async function loadReceipt(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: { member: true, reviewedBy: { select: { name: true } } },
  });
}

/** The official deposit receipt issued when a payment is approved. */
export async function DepositReceipt({ payment, settings }: { payment: ReceiptPayment; settings: Settings }) {
  const $ = (n: number) => money(n, settings.currencySymbol);
  // Savings as they stood once this payment was approved.
  const approvedSoFar = await prisma.payment.aggregate({
    where: { memberId: payment.memberId, status: "APPROVED", reviewedAt: { lte: payment.reviewedAt ?? new Date() } },
    _sum: { amount: true },
  });
  const total = approvedSoFar._sum.amount ?? payment.amount;
  const lastMonth = addMonths(payment.forMonth, payment.monthsCount - 1);
  const ledger = memberLedger(payment.member, total, settings, lastMonth); // months owed up to this payment, not today
  const monthsPaid = Math.floor(total / settings.monthlyAmount + 1e-9);
  const memberNo = payment.member.memberNo != null ? ` · #${String(payment.member.memberNo).padStart(2, "0")}` : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 rounded-xl bg-good-bg px-3.5 py-2.5 text-[13px] font-bold text-good">
        <Icon name="check" size={20} strokeWidth={2.4} />
        Payment approved · money received in society account
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-start justify-between bg-brand px-[18px] py-4 text-white">
          <div className="flex flex-col gap-0.5">
            <div className="text-[15px] font-extrabold">{settings.societyName}</div>
            <div className="text-xs text-brand-soft">Official deposit receipt</div>
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <div className="text-[11px] text-brand-soft">Receipt no.</div>
            <div className="text-[13px] font-extrabold">{payment.receiptNo ?? "—"}</div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-b border-dashed border-field px-[18px] py-4">
          <div className="text-xs text-muted">Amount received</div>
          <div className="text-[32px] font-extrabold">{$(payment.amount)}</div>
          <div className="text-xs text-muted">{takaInWords(payment.amount)}</div>
        </div>

        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-[18px] py-3 text-[13px]">
          <Field label="Member">{payment.member.name}{memberNo}</Field>
          <Field label={payment.monthsCount > 1 ? "For months" : "For month"}>
            {payment.monthsCount > 1 ? `${monthLabel(payment.forMonth)} – ${monthLabel(lastMonth)}` : monthLabel(payment.forMonth, "long")}
          </Field>
          <Field label="Method">{METHOD_LABELS[payment.method]}</Field>
          <Field label="Transaction ID">{payment.reference ?? "—"}</Field>
          <Field label="Received on">{fmtDate(payment.paidOn)}</Field>
          <Field label="Approved by">{payment.reviewedBy?.name ?? "Admin"}</Field>
        </div>

        <div className="mx-[18px] flex justify-between gap-3 border-t border-[#EFEDE6] py-3 text-[13px]">
          <span className="text-muted">Total savings after this</span>
          <span className="text-right font-extrabold">{$(total)} · {monthsPaid} of {ledger.monthsOwed} months</span>
        </div>

        <div className="flex items-center gap-3 border-t border-[#EFEDE6] bg-[#FAF9F5] px-[18px] pb-4 pt-3">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-white text-center">
            <span className="text-[10px] text-muted">Code</span>
            <span className="text-xs font-extrabold">{payment.verifyCode ?? "—"}</span>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Enter code <strong className="text-ink">{payment.verifyCode ?? "—"}</strong> on the app&apos;s <em>Check a receipt</em> page to confirm this receipt is genuine.
            {payment.reviewedAt && ` Issued ${fmtDateTime(payment.reviewedAt)}.`}
          </p>
        </div>
      </div>

      <ReceiptActions title={`${settings.societyName} receipt ${payment.receiptNo ?? ""}`} />
    </div>
  );
}
