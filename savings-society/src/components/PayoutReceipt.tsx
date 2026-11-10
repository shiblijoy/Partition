import { money, type Settings } from "@/lib/settings";
import { fmtDateTime, inWords } from "@/lib/format";
import { pii } from "@/lib/crypto";
import { receiptQrSvg } from "@/lib/receipts";
import { translate, dateName } from "@/lib/i18n";
import { Field, Line } from "@/components/ui";
import type { Receipt, Withdrawal, User } from "@prisma/client";

const KIND_LABEL = { FULL: "Withdrawal payout · full exit", PARTIAL: "Withdrawal payout · partial", NOMINEE: "Settlement to nominee", LAND_SHARE: "Land share payout" };

/** FR-RCP-02: the receipt issued when a withdrawal or settlement is paid out. */
export async function PayoutReceipt({ withdrawal, member, settings, lang = "en" }: { withdrawal: Withdrawal & { receipt: Receipt | null }; member: User; settings: Settings; lang?: string }) {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const w = withdrawal;
  const m = pii(member);
  const memberNo = m.memberNo != null ? ` · #${String(m.memberNo).padStart(2, "0")}` : "";
  const paidTo = w.kind === "NOMINEE" ? `${m.nomineeName ?? t("Nominee")} (${t("nominee")})` : m.name + memberNo;
  const qr = w.receipt ? await receiptQrSvg(w.receipt.verifyCode) : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-start justify-between bg-brand px-[18px] py-4 text-white">
        <div className="flex flex-col gap-0.5">
          <div className="text-[15px] font-extrabold">{settings.societyName}</div>
          <div className="text-xs text-brand-soft">{t(KIND_LABEL[w.kind])}</div>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <div className="text-[11px] text-brand-soft">{t("Receipt no.")}</div>
          <div className="text-[13px] font-extrabold">{w.receipt?.receiptNo ?? t("Not paid yet")}</div>
        </div>
      </div>

      <div className="flex flex-col border-b border-dashed border-field px-[18px] py-3.5">
        {w.kind === "PARTIAL" || w.kind === "LAND_SHARE" ? (
          <Line label={t(w.kind === "PARTIAL" ? "Partial withdrawal" : "Land gain share")} value={$(w.payable ?? w.amount ?? 0)} />
        ) : (
          <>
            <Line label={t("Deposits")} value={$(w.deposits ?? 0)} />
            <Line label={t("+ Profit share")} value={`+ ${$(w.profitShare ?? 0)}`} tone="good" />
            <Line label={t("− Cost share")} value={`− ${$(w.costShare ?? 0)}`} tone="bad" />
            {w.landTiming === "NOW" && <Line label={t("+ Land gain share")} value={`+ ${$(w.landShare ?? 0)}`} tone="good" />}
          </>
        )}
        <Line label={t(w.kind === "NOMINEE" ? "Paid to nominee" : "Paid to member")} value={$(w.payable ?? 0)} total />
        <p className="pt-1 text-xs text-muted">{inWords(w.payable ?? 0, lang)}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-[18px] py-3 text-[13px]">
        <Field label={t("Paid to")}>{paidTo}</Field>
        <Field label={t("Paid on")}>{w.paidAt ? dateName(w.paidAt, lang) : "—"}</Field>
        <Field label={t("Sent to")}>{w.payTo}</Field>
        <Field label={t("Transaction ID")}>{w.paidReference ?? "—"}</Field>
      </div>

      {w.landTiming === "ON_SALE" && (w.landShare ?? 0) > 0 && (
        <p className="mx-[18px] mb-3 rounded-lg bg-warn-bg px-3 py-2 text-xs leading-snug text-warn">
          {t("Still owed later: land gain share (estimate {amount}), paid when the land is sold.", { amount: $(w.landShare ?? 0) })}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-[#EFEDE6] bg-[#FAF9F5] px-[18px] py-3 text-xs text-muted">
        {qr && <div className="h-16 w-16 shrink-0 rounded-lg border border-line bg-white p-1 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={t("QR code to check this receipt")} dangerouslySetInnerHTML={{ __html: qr }} />}
        <div className="flex flex-col gap-1">
          <span>{t("Paid by {name}", { name: w.paidBy ?? "Admin" })}{w.paidAt && ` · ${fmtDateTime(w.paidAt)}`}{w.receipt && ` · ${t("code")} ${w.receipt.verifyCode}`}</span>
          <span className={w.memberConfirmedAt ? "font-bold text-good" : "font-bold text-warn"}>
            {w.memberConfirmedAt
              ? t("Received, confirmed by {who} · {when}", { who: w.kind === "NOMINEE" ? t("nominee") : m.name, when: fmtDateTime(w.memberConfirmedAt) })
              : w.problemNote
                ? t("Problem reported: {note}", { note: w.problemNote })
                : t("Waiting for {who} to confirm receipt", { who: w.kind === "NOMINEE" ? t("nominee") : m.name })}
          </span>
        </div>
      </div>
    </div>
  );
}
