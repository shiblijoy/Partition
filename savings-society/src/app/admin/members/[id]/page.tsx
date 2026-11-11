import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { memberPosition } from "@/lib/society";
import { openAccounts } from "@/lib/books";
import { openMonths } from "@/lib/services/payments";
import { pii } from "@/lib/crypto";
import { rateFor } from "@/lib/rates";
import { currentMonth, monthLabel, monthRange } from "@/lib/months";
import { dateInput, fmtDate, mask } from "@/lib/format";
import { Badge, Card, Field, MonthCell, MonthLegend, Pill, fileClass, inputClass, labelClass, secondaryButton, smallSecondary, METHOD_LABELS } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ProofLink } from "@/components/ProofLink";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { PendingDetailsChange } from "@/components/PendingDetailsChange";
import { markDeceased, removeMember, resetPassword, restoreMember, unlockAccount, updateMember } from "../actions";

export default async function MemberDetailPage({ params }: PageProps<"/admin/members/[id]">) {
  const viewer = await requireStaff();
  const canEdit = viewer.role === "ADMIN";
  const { id } = await params;
  const [settings, raw, openWithdrawal, pendingEdit, accounts, position] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({ where: { id }, include: { payments: { orderBy: [{ createdAt: "desc" }, { forMonth: "desc" }], include: { receipt: true } } } }),
    prisma.withdrawal.findFirst({ where: { memberId: id, status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.memberRequest.findFirst({ where: { memberId: id, status: "OPEN", changes: { not: null } }, include: { member: { select: { name: true } } } }),
    openAccounts(),
    memberPosition(id),
  ]);
  if (!raw || raw.role !== "MEMBER") notFound();
  const member = { ...raw, ...pii(raw) };

  const $ = (n: number) => money(n, settings.currencySymbol);
  const pendingList = member.payments.filter((p) => p.status === "PENDING");
  const ledger = memberLedger(member, member.payments.filter((p) => p.status === "APPROVED"), settings, { pending: pendingList.map((p) => p.forMonth) });
  const pendingMonths = pendingList.length;
  const now = currentMonth();
  const year = now.slice(0, 4);
  const months = monthRange(`${year}-01`, `${year}-12`);
  const recordable = (await openMonths(member.id, settings)).map((key) => ({
    key,
    amount: rateFor(key, settings.rates),
    label: `${monthLabel(key)}${ledger.statusFor(key) === "due" ? " (due)" : key > now ? " (advance)" : ""}`,
  }));
  const locked = member.lockedUntil && member.lockedUntil > new Date();
  const gone = !!member.exit || !member.active;
  const status = member.exit ?? (!member.active ? "DECEASED" : openWithdrawal ? "EXITING" : "ACTIVE");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/members" className="text-[13px] font-bold">← Members</Link>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={member.name} path={member.avatarPath} size={48} />
            <h1 className="text-[28px] font-extrabold">{member.name}</h1>
            <Pill tone={status === "ACTIVE" ? "good" : status === "EXITING" ? "warn" : "neutral"}>{status.charAt(0) + status.slice(1).toLowerCase()}</Pill>
          </div>
          <p className="text-[13px] font-semibold text-muted">
            {member.memberNo != null && `Member #${String(member.memberNo).padStart(2, "0")} · `}joined {monthLabel(member.joinMonth)} · {member.phone}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {canEdit && locked && (
            <form action={unlockAccount.bind(null, member.id)}><button className={secondaryButton}>Unlock account (locked after wrong passwords)</button></form>
          )}
          {canEdit && !gone && (
            <details className="relative">
              <summary className={`${secondaryButton} cursor-pointer list-none`}>Reset password</summary>
              <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-line bg-white p-4 shadow-lg">
                <ActionForm action={resetPassword.bind(null, member.id)} submitLabel="Create temporary password" buttonClass={`w-full ${secondaryButton}`}>
                  <p className="text-[13px] text-muted">Signs them out on every phone. They set a new password at next login.</p>
                </ActionForm>
              </div>
            </details>
          )}
          {!canEdit ? null : gone ? (
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
          {pendingEdit && <PendingDetailsChange request={pendingEdit} canEdit={canEdit} />}
          <Card title="Account">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="Deposits">{$(position.deposits)}</Field>
              <Field label="Net value">{$(position.net)}</Field>
              <Field label="Profit share">+&nbsp;{$(position.profitShare)}</Field>
              <Field label="Cost share">−&nbsp;{$(position.costShare)}</Field>
              <Field label="Joining rule">{member.joiningRule === "PAY_BACK" ? (member.caughtUpAt ? "Paid back · founding member" : "Paying back past months") : "Start fresh"}</Field>
              <Field label="Statement"><a href={`/member/statement/pdf?member=${member.id}&year=${year}`} target="_blank" rel="noopener">{year} PDF</a></Field>
            </div>
          </Card>
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

          {canEdit && <Card>
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
          </Card>}
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
              Approved deposits <strong>{$(ledger.paid)}</strong> · {ledger.monthsPaid} of {ledger.monthsOwed} months · due <strong className={ledger.due > 0 ? "text-bad" : ""}>{$(ledger.due)}</strong>
              {ledger.advance > 0 && <> · paid ahead <strong>{$(ledger.advance)}</strong></>}
              {pendingMonths > 0 && <span className="text-warn"> · {pendingMonths} month(s) waiting for approval</span>}
            </p>
          </Card>

          {canEdit && !gone && recordable.length > 0 && (
            <Card title="Record payment for this member">
              <p className="mb-3 text-[13px] text-muted">For cash handed to you, or a member who doesn&apos;t use the app. Approved at once, marked &ldquo;Recorded by admin&rdquo;, with a receipt per month. Months already paid or waiting are left out.</p>
              <RecordPaymentForm memberId={member.id} months={recordable} currency={settings.currencySymbol} today={dateInput()} accounts={accounts} />
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
                      <p className="text-sm font-bold">{$(p.amount)} · {monthLabel(p.forMonth)}</p>
                      <p className="text-xs text-muted">
                        {METHOD_LABELS[p.method]} · paid {fmtDate(p.paidOn)}
                        {p.receivedOn && ` · received ${fmtDate(p.receivedOn)}`}
                        {p.reference && ` · ${p.reference}`}
                        {p.recordedBy && ` · recorded by ${p.recordedBy}`}
                        {p.status === "REVERSED" && ` · reversed: ${p.reversalReason}`}
                      </p>
                    </div>
                    {p.receipt && <Link href={`/admin/receipts/${p.id}`} className="text-[13px] font-bold">{p.receipt.receiptNo}</Link>}
                    {p.status === "PENDING" ? <Link href={`/admin/payments/${p.id}`} className={`${smallSecondary} no-underline`}>Review</Link> : <Link href={`/admin/payments/${p.id}`} className="no-underline"><Badge label={p.status} /></Link>}
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
