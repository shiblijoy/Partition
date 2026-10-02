import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { fundSummary } from "@/lib/society";
import { addMonths, currentMonth, monthLabel, monthRange } from "@/lib/months";
import {
  Badge,
  Card,
  MonthCell,
  MonthLegend,
  StatCard,
  inputClass,
  labelClass,
  secondaryButton,
  METHOD_LABELS,
} from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ProofLink } from "@/components/ProofLink";
import { recordPayment, resetPassword, updateMember } from "../actions";

export default async function MemberDetailPage({ params }: PageProps<"/admin/members/[id]">) {
  const { id } = await params;
  const [settings, member, fund] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: "desc" } } },
    }),
    fundSummary(),
  ]);
  if (!member || member.role !== "MEMBER") notFound();

  const $ = (n: number) => money(n, settings.currencySymbol);
  const approvedTotal = member.payments.filter((p) => p.status === "APPROVED").reduce((s, p) => s + p.amount, 0);
  const ledger = memberLedger(member, approvedTotal, settings);
  const now = currentMonth();
  const months = monthRange(ledger.firstMonth, addMonths(now, 2));
  const net = ledger.paid - (member.active ? fund.expenseSharePerMember : 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/members" className="text-sm text-slate-500 hover:text-teal-700">← Members</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{member.name}</h1>
          <Badge label={member.active ? "ACTIVE" : "INACTIVE"} />
        </div>
        <p className="text-sm text-slate-500">
          {member.phone}
          {member.email && ` · ${member.email}`} · member since {monthLabel(member.joinMonth, "long")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Deposited" value={$(ledger.paid)} tone="good" />
        <StatCard label="Expected" value={$(ledger.expected)} hint={`${ledger.monthsOwed} months`} />
        <StatCard
          label={ledger.due > 0 ? "Due" : "Paid ahead"}
          value={$(ledger.due > 0 ? ledger.due : ledger.advance)}
          tone={ledger.due > 0 ? "bad" : "good"}
        />
        <StatCard label="Net savings" value={$(net)} hint={`After ${$(fund.expenseSharePerMember)} cost share`} />
      </div>

      <Card title="Month by month">
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
          {months.map((m) => (
            <MonthCell key={m} month={m} status={ledger.statusFor(m)} />
          ))}
        </div>
        <MonthLegend />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Payments">
          {member.payments.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {member.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <ProofLink path={p.proofPath} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{$(p.amount)} · {monthLabel(p.forMonth)}</p>
                    <p className="text-xs text-slate-500">
                      {METHOD_LABELS[p.method]} · {p.paidOn.toLocaleDateString()}
                      {p.reference && ` · ${p.reference}`}
                    </p>
                  </div>
                  <Badge label={p.status} />
                </li>
              ))}
            </ul>
          )}
          {member.payments.some((p) => p.status === "PENDING") && (
            <Link href="/admin/payments" className={`mt-3 inline-block ${secondaryButton}`}>Review pending →</Link>
          )}
        </Card>

        <Card title="Record a payment (cash / received directly)">
          <ActionForm action={recordPayment.bind(null, member.id)} submitLabel="Record & approve">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="forMonth" className={labelClass}>For month</label>
                <input
                  id="forMonth"
                  name="forMonth"
                  type="month"
                  required
                  defaultValue={ledger.paidThrough ? addMonths(ledger.paidThrough, 1) : ledger.firstMonth}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="amount" className={labelClass}>Amount</label>
                <input id="amount" name="amount" type="number" min="1" step="any" required defaultValue={settings.monthlyAmount} className={inputClass} />
              </div>
              <div>
                <label htmlFor="method" className={labelClass}>Method</label>
                <select id="method" name="method" defaultValue="CASH" className={inputClass}>
                  {Object.entries(METHOD_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="paidOn" className={labelClass}>Date</label>
                <input id="paidOn" name="paidOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="reference" className={labelClass}>Reference <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="reference" name="reference" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="proof" className={labelClass}>Receipt <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium" />
              </div>
            </div>
          </ActionForm>
        </Card>

        <Card title="Edit details">
          <ActionForm action={updateMember.bind(null, member.id)} submitLabel="Save changes" resetOnSuccess={false}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="e-name" className={labelClass}>Name</label>
                <input id="e-name" name="name" required defaultValue={member.name} className={inputClass} />
              </div>
              <div>
                <label htmlFor="e-phone" className={labelClass}>Phone</label>
                <input id="e-phone" name="phone" type="tel" required defaultValue={member.phone} className={inputClass} />
              </div>
              <div>
                <label htmlFor="e-email" className={labelClass}>Email</label>
                <input id="e-email" name="email" type="email" defaultValue={member.email ?? ""} className={inputClass} />
              </div>
              <div>
                <label htmlFor="e-join" className={labelClass}>First deposit month</label>
                <input id="e-join" name="joinMonth" type="month" required defaultValue={member.joinMonth} className={inputClass} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={member.active} className="h-4 w-4" />
              Active member (unticking blocks login and removes them from cost sharing)
            </label>
          </ActionForm>
        </Card>

        <Card title="Reset password">
          <ActionForm action={resetPassword.bind(null, member.id)} submitLabel="Set new password" buttonClass={secondaryButton}>
            <input name="password" type="text" required minLength={8} placeholder="New password (min 8 characters)" autoComplete="off" className={inputClass} />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
