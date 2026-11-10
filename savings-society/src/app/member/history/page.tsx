import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { ledgerFor } from "@/lib/society";
import { tFor, monthName, dateName } from "@/lib/i18n";
import { Badge, Notice, METHOD_LABELS } from "@/components/ui";

/** FR-DSH-02: every month with its status, method, dates, rejection reasons and a receipt link. */
export default async function HistoryPage({ searchParams }: PageProps<"/member/history">) {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const lang = viewer.language;
  const { submitted } = await searchParams;
  const settings = await getSettings();
  const [payments, payouts, ledger] = await Promise.all([
    prisma.payment.findMany({ where: { memberId: viewer.userId }, include: { receipt: true }, orderBy: [{ createdAt: "desc" }, { forMonth: "desc" }] }),
    prisma.withdrawal.findMany({ where: { memberId: viewer.userId, status: { in: ["APPROVED", "PAID"] } }, orderBy: { createdAt: "desc" } }),
    ledgerFor(viewer.userId, settings),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const deposited = payments.filter((p) => p.status === "APPROVED").reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold">{t("My history")}</h1>
        <div className="flex gap-4">
          <Link href="/member/statement" className="py-2.5 text-sm font-bold">{t("Statement")}</Link>
          {!viewer.readOnly && <Link href="/member/withdraw" className="py-2.5 text-sm font-bold">{t("Withdraw")}</Link>}
        </div>
      </div>

      {submitted && <Notice>{t("Payment sent. You'll see it approved once the admin confirms the money reached the account.")}</Notice>}

      <div className="grid grid-cols-3 gap-2">
        {([
          ["Deposited", deposited],
          ["Pending", pending],
          ["Due", ledger.due],
        ] as const).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-xl border border-line bg-white p-3">
            <div className="text-xs text-muted">{t(label)}</div>
            <div className={`text-base font-extrabold ${label === "Due" && ledger.due > 0 ? "text-bad" : ""}`}>{$(value)}</div>
          </div>
        ))}
      </div>

      {payouts.map((w) => (
        <Link key={w.id} href={`/member/payouts/${w.id}`} className="flex items-center justify-between rounded-xl border border-line bg-white px-3.5 py-3 text-ink no-underline">
          <div className="flex flex-col gap-0.5">
            <div className="text-sm font-semibold">{t(w.kind === "PARTIAL" ? "Partial withdrawal" : w.kind === "LAND_SHARE" ? "Land share" : "Exit settlement")}</div>
            <div className="text-xs text-muted">{w.payable != null ? $(w.payable) : ""} · {w.paidAt ? t("paid {date}", { date: dateName(w.paidAt, lang, false) }) : t("payout scheduled")}</div>
          </div>
          <Badge label={w.status} lang={lang} />
        </Link>
      ))}

      <div className="flex flex-col gap-2">
        {payments.length === 0 && <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">{t("Nothing submitted yet.")}</p>}
        {payments.map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-line bg-white px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="text-sm font-semibold">{monthName(p.forMonth, lang, "long")}</div>
                <div className="truncate text-xs text-muted">
                  {$(p.amount)} · {t(METHOD_LABELS[p.method])}
                  {p.reference ? ` · TXN ${p.reference}` : ""}
                  {` · ${t("paid {date}", { date: dateName(p.paidOn, lang, false) })}`}
                  {p.receivedOn ? ` · ${t("received {date}", { date: dateName(p.receivedOn, lang, false) })}` : ""}
                  {p.recordedBy ? ` · ${t("Recorded by admin")}` : ""}
                </div>
              </div>
              <Badge label={p.status} lang={lang} />
            </div>
            {p.status === "APPROVED" && (
              <Link href={`/member/receipts/${p.id}`} className="self-start py-1 text-[13px] font-bold">{t("View receipt")} {p.receipt?.receiptNo}</Link>
            )}
            {p.status === "REJECTED" && p.reviewNote && <p className="rounded-lg bg-bad-bg px-2.5 py-2 text-xs leading-snug text-bad">{t("Admin: {reason}", { reason: p.reviewNote })}</p>}
            {p.status === "REVERSED" && (
              <p className="rounded-lg bg-paper px-2.5 py-2 text-xs leading-snug text-muted">
                {t("Approval reversed: {reason}. Receipt {no} is cancelled.", { reason: p.reversalReason ?? "", no: p.receipt?.receiptNo ?? "" })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
