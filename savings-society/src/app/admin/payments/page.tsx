import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, METHOD_LABELS, dangerLink, smallSecondary } from "@/components/ui";
import { ProofLink } from "@/components/ProofLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { reopenPayment, deletePayment } from "./actions";

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

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Check each proof against the bank or bKash statement, then approve once the money has arrived." />

      <nav className="mb-4 flex gap-1 rounded-xl bg-line p-1 text-sm" aria-label="Filter">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/payments?status=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-lg px-3 font-bold capitalize no-underline ${t === tab ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {t.toLowerCase()} ({countFor(t)})
          </Link>
        ))}
      </nav>

      <Card>
        {payments.length === 0 ? (
          <Empty>{tab === "PENDING" ? "Nothing waiting for approval." : "Nothing here yet."}</Empty>
        ) : (
          <ul className="flex flex-col">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 border-b border-[#EFEDE6] py-3 last:border-0">
                <ProofLink path={p.proofPath} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/members/${p.memberId}`} className="font-bold text-ink">{p.member.name}</Link>
                    <Badge label={p.status} />
                  </div>
                  <p className="text-sm">
                    <strong>{$(p.amount)}</strong> · {monthLabel(p.forMonth, "long")}
                    {p.monthsCount > 1 && ` + ${p.monthsCount - 1} more`} · {METHOD_LABELS[p.method]}
                    {p.reference && ` · ${p.reference}`}
                  </p>
                  <p className="text-xs text-muted">
                    Paid {fmtDate(p.paidOn)}
                    {p.reviewedAt && ` · ${p.status === "APPROVED" ? "approved" : "rejected"} by ${p.reviewedBy?.name ?? "—"} on ${fmtDate(p.reviewedAt)}`}
                    {p.receiptNo && ` · ${p.receiptNo}`}
                    {p.reviewNote && ` — ${p.reviewNote}`}
                  </p>
                </div>
                {p.status === "PENDING" ? (
                  <Link href={`/admin/payments/${p.id}`} className={`${smallSecondary} no-underline`}>Review</Link>
                ) : (
                  <div className="flex items-center gap-1">
                    {p.status === "APPROVED" && <Link href={`/admin/receipts/${p.id}`} className="px-2 py-2 text-[13px] font-bold">Receipt</Link>}
                    <ConfirmButton action={reopenPayment.bind(null, p.id)} confirmText="Move this payment back to pending? Its receipt is withdrawn." className={smallSecondary}>
                      Undo
                    </ConfirmButton>
                    <ConfirmButton action={deletePayment.bind(null, p.id)} confirmText="Delete this payment record and its proof permanently?" className={dangerLink}>
                      Delete
                    </ConfirmButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
