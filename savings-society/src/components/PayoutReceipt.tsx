import { money, type Settings } from "@/lib/settings";
import { fmtDate, fmtDateTime, takaInWords } from "@/lib/format";
import { Field, Line } from "@/components/ui";
import type { Withdrawal, User } from "@prisma/client";

const KIND_LABEL = { FULL: "Withdrawal payout · full exit", PARTIAL: "Withdrawal payout · partial", NOMINEE: "Settlement to nominee" };

/** The receipt issued when a withdrawal or settlement is paid out. */
export function PayoutReceipt({
  withdrawal,
  member,
  settings,
  paidBy,
}: {
  withdrawal: Withdrawal;
  member: User;
  settings: Settings;
  paidBy: string;
}) {
  const $ = (n: number) => money(n, settings.currencySymbol);
  const w = withdrawal;
  const memberNo = member.memberNo != null ? ` · #${String(member.memberNo).padStart(2, "0")}` : "";
  const paidTo = w.kind === "NOMINEE" ? `${member.nomineeName ?? "Nominee"} (nominee)` : member.name + memberNo;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-start justify-between bg-brand px-[18px] py-4 text-white">
        <div className="flex flex-col gap-0.5">
          <div className="text-[15px] font-extrabold">{settings.societyName}</div>
          <div className="text-xs text-brand-soft">{KIND_LABEL[w.kind]}</div>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <div className="text-[11px] text-brand-soft">Receipt no.</div>
          <div className="text-[13px] font-extrabold">{w.receiptNo ?? "Not paid yet"}</div>
        </div>
      </div>

      <div className="flex flex-col border-b border-dashed border-field px-[18px] py-3.5">
        {w.kind === "PARTIAL" ? (
          <Line label="Partial withdrawal" value={$(w.payable ?? w.amount ?? 0)} />
        ) : (
          <>
            <Line label="Deposits" value={$(w.deposits ?? 0)} />
            <Line label="+ Profit share" value={`+\u00a0${$(w.profitShare ?? 0)}`} tone="good" />
            <Line label="− Cost share" value={`−\u00a0${$(w.costShare ?? 0)}`} tone="bad" />
            {w.landTiming === "NOW" && <Line label="+ Land gain share" value={`+\u00a0${$(w.landShare ?? 0)}`} tone="good" />}
          </>
        )}
        <Line label={w.kind === "NOMINEE" ? "Paid to nominee" : "Paid to member"} value={$(w.payable ?? 0)} total />
        <p className="pt-1 text-xs text-muted">{takaInWords(w.payable ?? 0)}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-[18px] py-3 text-[13px]">
        <Field label="Paid to">{paidTo}</Field>
        <Field label="Paid on">{w.paidAt ? fmtDate(w.paidAt) : "—"}</Field>
        <Field label="Sent to">{w.payTo}</Field>
        <Field label="Transaction ID">{w.paidReference ?? "—"}</Field>
      </div>

      {w.landTiming === "ON_SALE" && (w.landShare ?? 0) > 0 && (
        <p className="mx-[18px] mb-3 rounded-lg bg-warn-bg px-3 py-2 text-xs leading-snug text-warn">
          Still owed later: land gain share (estimate {$(w.landShare ?? 0)}), paid when the land is sold.
        </p>
      )}

      <div className="flex flex-col gap-1 border-t border-[#EFEDE6] bg-[#FAF9F5] px-[18px] py-3 text-xs text-muted">
        <span>Paid by {paidBy}{w.paidAt && ` · ${fmtDateTime(w.paidAt)}`}</span>
        <span className={w.memberConfirmedAt ? "font-bold text-good" : "font-bold text-warn"}>
          {w.memberConfirmedAt
            ? `Received, confirmed by ${w.kind === "NOMINEE" ? "nominee" : member.name} · ${fmtDateTime(w.memberConfirmedAt)}`
            : w.problemNote
              ? `Problem reported: ${w.problemNote}`
              : `Waiting for ${w.kind === "NOMINEE" ? "nominee" : member.name} to confirm receipt`}
        </span>
      </div>
    </div>
  );
}
