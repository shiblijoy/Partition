import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { ledgerFor } from "@/lib/society";
import { openAccounts } from "@/lib/books";
import { duplicateReference } from "@/lib/services/payments";
import { monthLabel } from "@/lib/months";
import { dateInput, fmtDate, fmtDateTime } from "@/lib/format";
import { fileUrl, isPdf } from "@/lib/uploads";
import { Badge, Field, Notice, METHOD_LABELS } from "@/components/ui";
import { ProofViewer } from "@/components/ProofViewer";
import { ActionForm } from "@/components/ActionForm";
import { ReviewForm } from "./ReviewForm";
import { reverseApproval, undoRejection } from "../actions";

export default async function ReviewPage({ params }: PageProps<"/admin/payments/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const [settings, payment, queue, accounts] = await Promise.all([
    getSettings(),
    prisma.payment.findUnique({ where: { id }, include: { member: true, account: true, receipt: true, reviewedBy: { select: { name: true } } } }),
    prisma.payment.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { id: true, batchId: true } }),
    openAccounts(),
  ]);
  if (!payment) notFound();
  const batch = payment.batchId ? await prisma.payment.findMany({ where: { batchId: payment.batchId }, orderBy: { forMonth: "asc" } }) : [payment];
  const $ = (n: number) => money(n, settings.currencySymbol);
  const ledger = await ledgerFor(payment.memberId, settings);
  const dupes = (await duplicateReference(payment.reference, payment.batchId)).filter((d) => d.id !== payment.id);
  const total = batch.reduce((s, p) => s + p.amount, 0);
  // One entry per batch in the queue.
  const seen = new Set<string>();
  const batches = queue.filter((q) => { const k = q.batchId ?? q.id; if (seen.has(k)) return false; seen.add(k); return true; });
  const pos = batches.findIndex((q) => (q.batchId ?? q.id) === (payment.batchId ?? payment.id));
  const next = pos >= 0 ? batches[pos + 1] : batches[0];
  const canEdit = viewer.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/payments" className="text-[13px] font-bold">← Approval queue</Link>
        <div className="flex items-center gap-4 text-[13px]">
          {pos >= 0 && <span className="text-muted">{pos + 1} of {batches.length} waiting</span>}
          {next && next.id !== payment.id && <Link href={`/admin/payments/${next.id}`} className="font-bold">Next proof →</Link>}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[3_1_480px] flex-col gap-3 rounded-2xl border border-line bg-white p-4">
          <ProofViewer url={payment.proofPath ? fileUrl(payment.proofPath) : null} pdf={!!payment.proofPath && isPdf(payment.proofPath)} alt={`Payment proof from ${payment.member.name}`} />
        </section>

        <aside className="flex flex-[2_1_360px] flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/admin/members/${payment.memberId}`} className="text-xl font-extrabold text-ink">{payment.member.name}</Link>
                <p className="text-[13px] text-muted">
                  {payment.member.memberNo != null && `Member #${String(payment.member.memberNo).padStart(2, "0")} · `}
                  paid {ledger.monthsPaid} of {ledger.monthsOwed} months{ledger.due > 0 && ` · owes ${$(ledger.due)}`}
                </p>
              </div>
              <Badge label={payment.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label={batch.length > 1 ? `For ${batch.length} months` : "For month"}>
                {batch.length > 1 ? batch.map((p) => monthLabel(p.forMonth)).join(", ") : monthLabel(payment.forMonth, "long")}
              </Field>
              <Field label="Amount">{$(total)}</Field>
              <Field label="Method">{METHOD_LABELS[payment.method]}</Field>
              <Field label="Transaction ID">{payment.reference ?? "—"}</Field>
              <Field label="Member says they paid into">{payment.paidToId ? (accounts.find((a) => a.id === payment.paidToId)?.name ?? "A closed account") : "—"}</Field>
              <Field label="Member says paid on">{fmtDate(payment.paidOn)}</Field>
              <Field label="Submitted">{fmtDateTime(payment.createdAt)}</Field>
              <div className="col-span-2"><Field label="Member note">{payment.note ?? "—"}</Field></div>
              {payment.recordedBy && <div className="col-span-2"><Field label="Recorded by admin">{payment.recordedBy}</Field></div>}
            </div>
            {dupes.length > 0 && (
              <Notice tone="bad">
                This transaction ID was used before: {dupes.slice(0, 3).map((d) => `${d.member.name}, ${monthLabel(d.forMonth)} (${d.status.toLowerCase()})`).join("; ")}. Check the statement carefully.
              </Notice>
            )}
          </div>

          {payment.status === "PENDING" && canEdit && (
            <ReviewForm paymentId={payment.id} amount={$(total)} accounts={accounts} paidOn={dateInput(payment.paidOn)} today={dateInput()} paidToId={payment.paidToId} />
          )}
          {payment.status !== "PENDING" && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5 text-sm">
              <p className="text-muted">
                {payment.status === "APPROVED" && `Approved by ${payment.reviewedBy?.name ?? "—"} · money arrived ${payment.receivedOn ? fmtDate(payment.receivedOn) : "—"} in ${payment.account?.name ?? "—"}.`}
                {payment.status === "REJECTED" && `Rejected: ${payment.reviewNote}`}
                {payment.status === "REVERSED" && `Approval reversed ${payment.reversedAt ? fmtDate(payment.reversedAt) : ""}: ${payment.reversalReason}. Receipt ${payment.receipt?.receiptNo ?? ""} cancelled.`}
              </p>
              {payment.status === "APPROVED" && <Link href={`/admin/receipts/${payment.id}`} className="font-bold">View receipt {payment.receipt?.receiptNo}</Link>}
              {canEdit && payment.status === "APPROVED" && (
                <details>
                  <summary className="cursor-pointer text-[13px] font-bold text-bad">Approved by mistake? Reverse it</summary>
                  <ActionForm action={reverseApproval.bind(null, payment.id)} submitLabel="Reverse approval" buttonClass="h-11 rounded-xl bg-bad px-4 text-sm font-bold text-white" className="mt-3 flex flex-col gap-3">
                    <p className="text-[13px] text-muted">The deposit is taken back out by a reversing entry dated today, receipt {payment.receipt?.receiptNo} is marked cancelled, and {monthLabel(payment.forMonth)} becomes due again. Nothing is deleted.</p>
                    <input name="reason" required aria-label="Reason" placeholder="Reason (kept in the audit log)" className="h-11 rounded-xl border border-field px-3" />
                  </ActionForm>
                </details>
              )}
              {canEdit && payment.status === "REJECTED" && (
                <ActionForm action={undoRejection.bind(null, payment.id)} submitLabel="Rejected by mistake? Move back to the queue" buttonClass="h-11 rounded-xl border border-field px-4 text-sm font-bold">
                  <span className="sr-only">Undo rejection</span>
                </ActionForm>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
