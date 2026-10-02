import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { approvedTotalFor } from "@/lib/society";
import { addMonths, monthLabel } from "@/lib/months";
import { fmtDateTime } from "@/lib/format";
import { fileUrl, isPdf } from "@/lib/uploads";
import { Icon } from "@/components/icons";
import { Badge, Field } from "@/components/ui";
import { ReviewForm } from "./ReviewForm";

export default async function ReviewPage({ params }: PageProps<"/admin/payments/[id]">) {
  const { id } = await params;
  const [settings, payment, queue] = await Promise.all([
    getSettings(),
    prisma.payment.findUnique({ where: { id }, include: { member: true } }),
    prisma.payment.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  if (!payment) notFound();
  const $ = (n: number) => money(n, settings.currencySymbol);
  const ledger = memberLedger(payment.member, await approvedTotalFor(payment.memberId), settings);
  const monthsPaid = Math.floor(ledger.paid / settings.monthlyAmount + 1e-9);
  const pos = queue.findIndex((q) => q.id === payment.id);
  const next = pos >= 0 ? queue[pos + 1] : queue[0];
  const url = payment.proofPath ? fileUrl(payment.proofPath) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="text-[13px] font-bold">← Approval queue</Link>
        <div className="flex items-center gap-4 text-[13px]">
          {pos >= 0 && <span className="text-muted">{pos + 1} of {queue.length} waiting</span>}
          {next && next.id !== payment.id && <Link href={`/admin/payments/${next.id}`} className="font-bold">Next proof →</Link>}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[3_1_480px] flex-col gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-xl bg-[#ECEAE2]">
            {!url && <span className="text-sm text-muted">No proof attached (recorded by admin)</span>}
            {url && isPdf(payment.proofPath!) && <iframe src={url} title="Payment proof" className="h-[600px] w-full" />}
            {url && !isPdf(payment.proofPath!) && (
              <Image src={url} alt={`Payment proof from ${payment.member.name}`} width={900} height={1200} unoptimized className="h-auto max-h-[720px] w-auto max-w-full object-contain" />
            )}
          </div>
          {url && (
            <div className="flex gap-4 text-[13px] font-bold">
              <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-1.5"><Icon name="eye" size={18} /> Open full size</a>
              <a href={url} download className="flex min-h-11 items-center gap-1.5"><Icon name="download" size={18} /> Download</a>
            </div>
          )}
        </section>

        <aside className="flex flex-[2_1_360px] flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/admin/members/${payment.memberId}`} className="text-xl font-extrabold text-ink">{payment.member.name}</Link>
                <p className="text-[13px] text-muted">
                  {payment.member.memberNo != null && `Member #${String(payment.member.memberNo).padStart(2, "0")} · `}
                  paid {monthsPaid} of {ledger.monthsOwed} months{ledger.due > 0 && ` · owes ${$(ledger.due)}`}
                </p>
              </div>
              <Badge label={payment.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label={payment.monthsCount > 1 ? "For months" : "For month"}>
                {payment.monthsCount > 1 ? `${monthLabel(payment.forMonth)} – ${monthLabel(addMonths(payment.forMonth, payment.monthsCount - 1))}` : monthLabel(payment.forMonth, "long")}
              </Field>
              <Field label="Amount">{$(payment.amount)}</Field>
              <Field label="Method">{payment.method === "BANK" ? "Bank" : payment.method.charAt(0) + payment.method.slice(1).toLowerCase()}</Field>
              <Field label="Transaction ID">{payment.reference ?? "—"}</Field>
              <Field label="Submitted">{fmtDateTime(payment.createdAt)}</Field>
              <Field label="Member note">{payment.note ?? "—"}</Field>
            </div>
          </div>

          {payment.status === "PENDING" ? (
            <ReviewForm paymentId={payment.id} amount={$(payment.amount)} />
          ) : (
            <p className="rounded-xl bg-white p-4 text-sm text-muted ring-1 ring-line">
              Already {payment.status.toLowerCase()}.{" "}
              {payment.status === "APPROVED" && <Link href={`/admin/receipts/${payment.id}`}>View receipt</Link>}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
