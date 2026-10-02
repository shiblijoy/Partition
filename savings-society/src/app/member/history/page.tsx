import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { monthLabel } from "@/lib/months";
import { Badge, Card, PageHeader, METHOD_LABELS } from "@/components/ui";
import { ProofLink } from "@/components/ProofLink";

export default async function HistoryPage({ searchParams }: PageProps<"/member/history">) {
  const session = await requireMember();
  const { submitted } = await searchParams;
  const [settings, payments] = await Promise.all([
    getSettings(),
    prisma.payment.findMany({ where: { memberId: session.userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);

  return (
    <div>
      <PageHeader title="My payments" subtitle="Everything you've submitted and its approval status." />
      {submitted && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ Payment submitted. You&apos;ll see it marked approved once the admin confirms it reached the account.
        </p>
      )}
      <Card>
        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={p.id} className="flex gap-3 py-3">
                <ProofLink path={p.proofPath} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{$(p.amount)}</p>
                    <Badge label={p.status} />
                  </div>
                  <p className="text-sm text-slate-600">
                    For {monthLabel(p.forMonth, "long")} · {METHOD_LABELS[p.method]}
                    {p.reference && ` · ${p.reference}`}
                  </p>
                  <p className="text-xs text-slate-400">
                    Paid {p.paidOn.toLocaleDateString()} · submitted {p.createdAt.toLocaleDateString()}
                  </p>
                  {p.reviewNote && (
                    <p className={`mt-1 text-xs ${p.status === "REJECTED" ? "text-red-600" : "text-slate-500"}`}>
                      Admin: {p.reviewNote}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
