import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, METHOD_LABELS, smallSecondary } from "@/components/ui";
import { ProofLink } from "@/components/ProofLink";

const TABS = ["PENDING", "APPROVED", "REJECTED", "REVERSED"] as const;
type Tab = (typeof TABS)[number];

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireStaff();
  const { status } = await searchParams;
  const tab: Tab = TABS.includes(status as Tab) ? (status as Tab) : "PENDING";

  const [settings, payments, counts] = await Promise.all([
    getSettings(),
    prisma.payment.findMany({
      where: { status: tab },
      include: { member: true, reviewedBy: { select: { name: true } }, receipt: true },
      orderBy: tab === "PENDING" ? { createdAt: "asc" } : { reviewedAt: "desc" },
      take: 300,
    }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const countFor = (s: Tab) => counts.find((c) => c.status === s)?._count._all ?? 0;

  // Months paid together show as one row.
  const groups = new Map<string, typeof payments>();
  for (const p of payments) groups.set(p.batchId ?? p.id, [...(groups.get(p.batchId ?? p.id) ?? []), p]);

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Check each proof against the bank statement, then approve once the money has arrived." />

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-line p-1 text-sm" aria-label="Filter">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/payments?status=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 font-bold capitalize no-underline ${t === tab ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {t.toLowerCase()} ({countFor(t)})
          </Link>
        ))}
      </nav>

      <Card>
        {groups.size === 0 ? (
          <Empty>{tab === "PENDING" ? "Nothing waiting for approval." : "Nothing here yet."}</Empty>
        ) : (
          <ul className="flex flex-col">
            {[...groups.values()].map((batch) => {
              const p = batch[0];
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-4 border-b border-[#EFEDE6] py-3 last:border-0">
                  <ProofLink path={p.proofPath} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/members/${p.memberId}`} className="font-bold text-ink">{p.member.name}</Link>
                      <Badge label={p.status} />
                      {p.recordedBy && <span className="text-xs text-muted">recorded by admin</span>}
                    </div>
                    <p className="text-sm">
                      <strong>{$(batch.reduce((s, x) => s + x.amount, 0))}</strong> · {batch.map((x) => monthLabel(x.forMonth)).join(", ")} · {METHOD_LABELS[p.method]}
                      {p.reference && ` · ${p.reference}`}
                    </p>
                    <p className="text-xs text-muted">
                      Paid {fmtDate(p.paidOn)}
                      {p.reviewedAt && ` · ${p.status.toLowerCase()} by ${p.reviewedBy?.name ?? "—"} on ${fmtDate(p.reviewedAt)}`}
                      {batch.some((x) => x.receipt) && ` · ${batch.map((x) => x.receipt?.receiptNo).filter(Boolean).join(", ")}`}
                      {p.status === "REJECTED" && p.reviewNote && ` — ${p.reviewNote}`}
                      {p.status === "REVERSED" && p.reversalReason && ` — ${p.reversalReason}`}
                    </p>
                  </div>
                  <Link href={`/admin/payments/${p.id}`} className={`${smallSecondary} no-underline`}>{p.status === "PENDING" ? "Review" : "Open"}</Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
