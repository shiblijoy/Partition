import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { addMonths, currentMonth, monthLabel, monthRange } from "@/lib/months";
import { dateInput, fmtDate, mask } from "@/lib/format";
import { Badge, Card, Field, MonthCell, MonthLegend, Pill, fileClass, inputClass, labelClass, secondaryButton, smallSecondary, METHOD_LABELS } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ProofLink } from "@/components/ProofLink";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { PendingDetailsChange } from "@/components/PendingDetailsChange";
import { markDeceased, removeMember, resetPassword, restoreMember, updateMember } from "../actions";

export default async function MemberDetailPage({ params }: PageProps<"/admin/members/[id]">) {
  const { id } = await params;
  const [settings, member, openWithdrawal, pendingEdit] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({ where: { id }, include: { payments: { orderBy: { createdAt: "desc" } } } }),
    prisma.withdrawal.findFirst({ where: { memberId: id, status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.memberRequest.findFirst({ where: { memberId: id, status: "OPEN", changes: { not: null } }, include: { member: { select: { name: true } } } }),
  ]);
  if (!member || member.role !== "MEMBER") notFound();

  const $ = (n: number) => money(n, settings.currencySymbol);
  const approvedTotal = member.payments.filter((p) => p.status === "APPROVED").reduce((s, p) => s + p.amount, 0);
  const pendingMonths = member.payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.monthsCount, 0);
  const ledger = memberLedger(member, approvedTotal, settings);
  const now = currentMonth();
  const year = now.slice(0, 4);
  const months = monthRange(`${year}-01`, `${year}-12`);
  const firstOpen = ledger.paidThrough ? addMonths(ledger.paidThrough, 1) : ledger.firstMonth;
  const recordable = Array.from({ length: 6 }, (_, i) => addMonths(firstOpen, i)).map((key) => ({
    key,
    label: `${monthLabel(key)}${ledger.statusFor(key) === "due" ? " (due)" : key > now ? " (advance)" : ""}`,
  }));
  const gone = !!member.exit || !member.active;
  const status = member.exit ?? (!member.active ? "DECEASED" : openWithdrawal ? "EXITING" : "ACTIVE");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/members" className="text-[13px] font-bold">← Members</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-extrabold">{member.name}</h1>
            <Pill tone={status === "ACTIVE" ? "good" : status === "EXITING" ? "warn" : "neutral"}>{status.charAt(0) + status.slice(1).toLowerCase()}</Pill>
          </div>
          <p className="text-[13px] font-semibold text-muted">
            {member.memberNo != null && `Member #${String(member.memberNo).padStart(2, "0")} · `}joined {monthLabel(member.joinMonth)} · {member.phone}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {!gone && (
            <details className="relative">
              <summary className={`${secondaryButton} cursor-pointer list-none`}>Reset password</summary>
              <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-line bg-white p-4 shadow-lg">
                <ActionForm action={resetPassword.bind(null, member.id)} submitLabel="Create temporary password" buttonClass={`w-full ${secondaryButton}`}>
                  <p className="text-[13px] text-muted">Signs them out on every phone. They set a new password at next login.</p>
                </ActionForm>
              </div>
            </details>
          )}
          {gone ? (
            <ConfirmButton action={restoreMember.bind(null, member.id)} confirmText={`Restore ${member.name} as an active member?`} className={secondaryButton}>
              Restore
            </ConfirmButton>
          ) : openWithdrawal ? (
            <Link href={`/admin/withdrawals/${openWithdrawal.id}`} className={`${secondaryButton} no-underline`}>Open settlement</Link>
          ) : (
            <>
              <details className="relative">
                <summary className={`${secondaryButton} cursor-pointer list-none`}>Mark as deceased</summary>
                <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-line bg-white p-4 shadow-lg">
                  <ActionForm action={markDeceased.bind(null, member.id)} submitLabel="Record & open nominee settlement" buttonClass={`w-full ${secondaryButton}`}>
                    <div>
                      <label htmlFor="dod" className={labelClass}>Date of death</label>
                      <input id="dod" name="date" type="date" required max={dateInput()} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="cert" className={labelClass}>Death certificate</label>
                      <input id="cert" name="certificate" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
                    </div>
                  </ActionForm>
                </div>
              </details>
              <details className="relative">
                <summary className={`${secondaryButton} cursor-pointer list-none text-bad`}>Remove</summary>
                <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-line bg-white p-4 shadow-lg">
                  <ActionForm action={removeMember.bind(null, member.id)} submitLabel="Remove & open settlement" buttonClass={`w-full ${secondaryButton} text-bad`}>
                    <p className="text-[13px] text-muted">They get their settlement like a withdrawal, and stop being a member once it&apos;s paid.</p>
                    <input name="reason" required aria-label="Reason" placeholder="Reason" className={inputClass} />
                  </ActionForm>
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          {pendingEdit && <PendingDetailsChange request={pendingEdit} />}
          <Card title="Profile">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="NID">{mask(member.nid)}</Field>
              <Field label="Date of birth">{member.dateOfBirth ?? "—"}</Field>
              <div className="col-span-2"><Field label="Address">{member.address ?? "—"}</Field></div>
            </div>
            <div className="mt-4 flex flex-col gap-0.5 rounded-xl bg-paper p-3 text-sm">
              <div className="text-xs font-extrabold tracking-wide text-muted">NOMINEE</div>
              <div className="font-bold">{member.nomineeName ? `${member.nomineeName}${member.nomineeRelation ? ` · ${member.nomineeRelation}` : ""}` : "Not set"}</div>
              {member.nomineeName && <div className="text-[13px] text-muted">{member.nomineePhone ?? "—"} · NID {mask(member.nomineeNid)}</div>}
            </div>
          </Card>

          <Card>
            <details>
              <summary className="cursor-pointer list-none text-base font-extrabold">Edit details</summary>
              <div className="mt-4">
                <ActionForm action={updateMember.bind(null, member.id)} submitLabel="Save changes" resetOnSuccess={false}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["name", "Name", member.name, true],
                        ["phone", "Mobile (login)", member.phone, true],
                        ["nid", "NID", member.nid, false],
                        ["dateOfBirth", "Date of birth", member.dateOfBirth, false],
                        ["address", "Address", member.address, false],
                        ["nomineeName", "Nominee name", member.nomineeName, false],
                        ["nomineeRelation", "Relation", member.nomineeRelation, false],
                        ["nomineePhone", "Nominee mobile", member.nomineePhone, false],
                        ["nomineeNid", "Nominee NID", member.nomineeNid, false],
                      ] as const
                    ).map(([name, label, value, required]) => (
                      <div key={name} className={name === "address" ? "sm:col-span-2" : ""}>
                        <label htmlFor={`e-${name}`} className={labelClass}>{label}</label>
                        <input id={`e-${name}`} name={name} required={required} defaultValue={value ?? ""} className={inputClass} />
                      </div>
                    ))}
                    <div>
                      <label htmlFor="e-join" className={labelClass}>First deposit month</label>
                      <input id="e-join" name="joinMonth" type="month" required defaultValue={member.joinMonth} className={inputClass} />
                    </div>
                  </div>
                </ActionForm>
              </div>
            </details>
          </Card>
        </div>

        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
          <Card title={`Payment record · ${year}`}>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {months.map((m) => (
                <MonthCell key={m} month={m} status={ledger.statusFor(m)} />
              ))}
            </div>
            <MonthLegend />
            <p className="mt-2 text-sm">
              Approved deposits <strong>{$(ledger.paid)}</strong> · due <strong className={ledger.due > 0 ? "text-bad" : ""}>{$(ledger.due)}</strong>
              {ledger.advance > 0 && <> · paid ahead <strong>{$(ledger.advance)}</strong></>}
              {pendingMonths > 0 && <span className="text-warn"> · {pendingMonths} month(s) waiting for approval</span>}
            </p>
          </Card>

          {!gone && (
            <Card title="Record payment for this member">
              <p className="mb-3 text-[13px] text-muted">For cash handed to you, or a member who doesn&apos;t use the app. Approved at once, with receipts.</p>
              <RecordPaymentForm memberId={member.id} months={recordable} monthly={settings.monthlyAmount} currency={settings.currencySymbol} today={dateInput()} />
            </Card>
          )}

          <Card title="Payments">
            {member.payments.length === 0 ? (
              <p className="text-sm text-muted">No payments yet.</p>
            ) : (
              <ul className="flex flex-col">
                {member.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-b border-[#EFEDE6] py-2.5 last:border-0">
                    <ProofLink path={p.proofPath} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{$(p.amount)} · {monthLabel(p.forMonth)}{p.monthsCount > 1 && ` +${p.monthsCount - 1}`}</p>
                      <p className="text-xs text-muted">
                        {METHOD_LABELS[p.method]} · {fmtDate(p.paidOn)}
                        {p.reference && ` · ${p.reference}`}
                        {p.reviewNote === "Recorded by admin" && " · recorded by admin"}
                      </p>
                    </div>
                    {p.status === "APPROVED" && <Link href={`/admin/receipts/${p.id}`} className="text-[13px] font-bold">Receipt</Link>}
                    {p.status === "PENDING" ? <Link href={`/admin/payments/${p.id}`} className={`${smallSecondary} no-underline`}>Review</Link> : <Badge label={p.status} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
