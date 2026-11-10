import { prisma } from "@/lib/prisma";
import { money, type Settings } from "@/lib/settings";
import { fmtDateTime, inWords } from "@/lib/format";
import { receiptQrSvg } from "@/lib/receipts";
import { translate, monthName, dateName } from "@/lib/i18n";
import { Icon } from "@/components/icons";
import { Field, METHOD_LABELS } from "@/components/ui";
import { ReceiptActions } from "@/components/ReceiptActions";

type ReceiptPayment = NonNullable<Awaited<ReturnType<typeof loadReceipt>>>;

export async function loadReceipt(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: { member: true, reviewedBy: { select: { name: true } }, receipt: true, account: true },
  });
}

/** FR-RCP-01: the official deposit receipt issued when a payment is approved. */
export async function DepositReceipt({ payment, settings, lang = "en" }: { payment: ReceiptPayment; settings: Settings; lang?: string }) {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const r = payment.receipt;
  // Savings as they stood once this payment was approved.
  const [approvedSoFar, monthsSoFar] = await Promise.all([
    prisma.payment.aggregate({ where: { memberId: payment.memberId, status: "APPROVED", reviewedAt: { lte: payment.reviewedAt ?? new Date() } }, _sum: { amount: true } }),
    prisma.payment.count({ where: { memberId: payment.memberId, status: "APPROVED", reviewedAt: { lte: payment.reviewedAt ?? new Date() } } }),
  ]);
  const total = approvedSoFar._sum.amount ?? payment.amount;
  const memberNo = payment.member.memberNo != null ? ` · #${String(payment.member.memberNo).padStart(2, "0")}` : "";
  const qr = r ? await receiptQrSvg(r.verifyCode) : null;

  return (
    <div className="flex flex-col gap-3">
      {r?.cancelledAt ? (
        <div className="rounded-xl bg-bad-bg px-3.5 py-2.5 text-[13px] font-bold text-bad">
          {t("Cancelled {date}: {reason}", { date: dateName(r.cancelledAt, lang), reason: r.cancelReason ?? "" })}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl bg-good-bg px-3.5 py-2.5 text-[13px] font-bold text-good">
          <Icon name="check" size={20} strokeWidth={2.4} />
          {t("Payment approved · money received in society account")}
        </div>
      )}

      <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-start justify-between bg-brand px-[18px] py-4 text-white">
          <div className="flex flex-col gap-0.5">
            <div className="text-[15px] font-extrabold">{settings.societyName}</div>
            <div className="text-xs text-brand-soft">{t("Official deposit receipt")}</div>
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <div className="text-[11px] text-brand-soft">{t("Receipt no.")}</div>
            <div className="text-[13px] font-extrabold">{r?.receiptNo ?? "—"}</div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-b border-dashed border-field px-[18px] py-4">
          <div className="text-xs text-muted">{t("Amount received")}</div>
          <div className="text-[32px] font-extrabold">{$(payment.amount)}</div>
          <div className="text-xs text-muted">{inWords(payment.amount, lang)}</div>
        </div>

        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-[18px] py-3 text-[13px]">
          <Field label={t("Member")}>{payment.member.name}{memberNo}</Field>
          <Field label={t("For month")}>{monthName(payment.forMonth, lang, "long")}</Field>
          <Field label={t("Method")}>{t(METHOD_LABELS[payment.method])}</Field>
          <Field label={t("Transaction ID")}>{payment.reference ?? "—"}</Field>
          <Field label={t("Date received")}>{payment.receivedOn ? dateName(payment.receivedOn, lang) : "—"}</Field>
          <Field label={t("Approved by")}>{r?.issuedBy ?? payment.reviewedBy?.name ?? "Admin"}</Field>
          {payment.recordedBy && <div className="col-span-2"><Field label={t("Recorded by admin")}>{payment.recordedBy}</Field></div>}
        </div>

        <div className="mx-[18px] flex justify-between gap-3 border-t border-[#EFEDE6] py-3 text-[13px]">
          <span className="text-muted">{t("Total savings after this")}</span>
          <span className="text-right font-extrabold">{$(total)} · {t("{n} months", { n: monthsSoFar })}</span>
        </div>

        <div className="flex items-center gap-3 border-t border-[#EFEDE6] bg-[#FAF9F5] px-[18px] pb-4 pt-3">
          {qr ? (
            <div className="h-20 w-20 shrink-0 rounded-lg border border-line bg-white p-1.5 [&>svg]:h-full [&>svg]:w-full" aria-label={t("QR code to check this receipt")} role="img" dangerouslySetInnerHTML={{ __html: qr }} />
          ) : null}
          <p className="text-xs leading-relaxed text-muted">
            {t("Scan the QR code, or enter code {code} on the Check a receipt page, to confirm this receipt is genuine.", { code: r?.verifyCode ?? "—" })}
            {r && ` ${t("Issued {when}.", { when: fmtDateTime(r.issuedAt) })}`}
          </p>
        </div>
      </div>

      {r && <ReceiptActions title={`${settings.societyName} receipt ${r.receiptNo}`} receiptNo={r.receiptNo} />}
    </div>
  );
}
