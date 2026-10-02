import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { monthLabel } from "@/lib/months";
import { Badge, Card, PageHeader, inputClass, secondaryButton, METHOD_LABELS } from "@/components/ui";
import { ProofLink } from "@/components/ProofLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ActionForm } from "@/components/ActionForm";
import { approvePayment, rejectPayment, reopenPayment, deletePayment } from "./actions";

const TABS = ["PENDING", "APPROVED", "REJECTED"] as const;
type Tab = (typeof TABS)[number];

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const { status } = await searchParams;
  const tab: Tab = TABS.includes(status as Tab) ? (status as Tab) : "PENDING";

  const [settings, payments, counts] = await Promise.all([
    getSettings(),
    prisma.payment.findMany({
      where: { status: tab },
      include: { member: true, reviewedBy: { select: { name: true } } },
      orderBy: tab === "PENDING" ? { createdAt: "asc" } : { reviewedAt: "desc" },
      take: 200,
    }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const countFor = (s: Tab) => counts.find((c) => c.status === s)?._count._all ?? 0;

  // For the pending queue, show each member's current standing next to their submission.
  const approvedTotals =
    tab === "PENDING"
      ? new Map(
          (
            await prisma.payment.groupBy({
              by: ["memberId"],
              where: { status: "APPROVED", memberId: { in: payments.map((p) => p.memberId) } },
              _sum: { amount: true },
            })
          ).map((r) => [r.memberId, r._sum.amount ?? 0])
        )
      : new Map<string, number>();

  return (
    <div>
      <PageHeader
        title="Payment approvals"
        subtitle="Check each proof against the bank/bKash account, then approve once the money has arrived."
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/payments?status=${t}`}
            className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium capitalize ${
              t === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.toLowerCase()} ({countFor(t)})
          </Link>
        ))}
      </div>

      {payments.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-500">
            {tab === "PENDING" ? "🎉 Nothing waiting for approval." : "Nothing here yet."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {payments.map((p) => {
            const ledger =
              tab === "PENDING" ? memberLedger(p.member, approvedTotals.get(p.memberId) ?? 0, settings) : null;
            return (
              <Card key={p.id}>
                <div className="flex gap-4">
                  <ProofLink path={p.proofPath} size={96} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/admin/members/${p.memberId}`} className="font-semibold text-slate-900 hover:text-teal-700">
                        {p.member.name}
                      </Link>
                      <Badge label={p.status} />
                    </div>
                    <p className="text-2xl font-semibold">{$(p.amount)}</p>
                    <p className="text-sm text-slate-600">
                      For {monthLabel(p.forMonth, "long")} · {METHOD_LABELS[p.method]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.reference ? <>Txn: <span className="font-mono">{p.reference}</span> · </> : null}
                      Paid {p.paidOn.toLocaleDateString()} · {p.member.phone}
                    </p>
                    {p.note && <p className="text-xs italic text-slate-500">“{p.note}”</p>}
                    {ledger && (
                      <p className="text-xs text-slate-500">
                        Currently {ledger.due > 0 ? <span className="text-red-600">owes {$(ledger.due)}</span> : "up to date"}
                        {ledger.advance > 0 && ` (${$(ledger.advance)} ahead)`}
                      </p>
                    )}
                    {p.reviewedAt && (
                      <p className="text-xs text-slate-400">
                        {p.status === "APPROVED" ? "Approved" : "Rejected"} by {p.reviewedBy?.name ?? "—"} on{" "}
                        {p.reviewedAt.toLocaleDateString()}
                        {p.reviewNote && ` — ${p.reviewNote}`}
                      </p>
                    )}
                  </div>
                </div>

                {p.status === "PENDING" ? (
                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-start">
                    <ConfirmButton
                      action={approvePayment.bind(null, p.id)}
                      confirmText={`Approve ${$(p.amount)} from ${p.member.name}? Only do this once you've seen the money in the account.`}
                      className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
                    >
                      ✓ Approve
                    </ConfirmButton>
                    <details className="flex-1">
                      <summary className="cursor-pointer list-none rounded-md border border-red-200 px-4 py-2 text-center text-sm font-medium text-red-700 hover:bg-red-50 sm:inline-block">
                        ✕ Reject…
                      </summary>
                      <ActionForm
                        action={rejectPayment.bind(null, p.id)}
                        submitLabel="Reject payment"
                        buttonClass="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                        className="mt-2 space-y-2"
                      >
                        <input
                          name="reason"
                          required
                          placeholder="Reason, e.g. money not received / wrong amount"
                          className={inputClass}
                        />
                      </ActionForm>
                    </details>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                    <ConfirmButton
                      action={reopenPayment.bind(null, p.id)}
                      confirmText="Move this payment back to pending?"
                      className={secondaryButton}
                    >
                      Undo decision
                    </ConfirmButton>
                    <ConfirmButton
                      action={deletePayment.bind(null, p.id)}
                      confirmText="Delete this payment record and its proof permanently?"
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
