import Link from "next/link";
import { getSettings, money } from "@/lib/settings";
import { membersWithLedgers } from "@/lib/society";
import { currentMonth, monthLabel } from "@/lib/months";
import { Badge, Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { addMember } from "./actions";

export default async function MembersPage() {
  const settings = await getSettings();
  const members = await membersWithLedgers(settings, { includeInactive: true });
  const $ = (n: number) => money(n, settings.currencySymbol);

  return (
    <div className="space-y-6">
      <PageHeader title="Members" subtitle={`${members.filter((m) => m.active).length} active members`} />

      <Card>
        {members.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No members yet — add the first one below.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 sm:px-2">Member</th>
                  <th className="px-2 py-2 text-right">Deposited</th>
                  <th className="px-2 py-2 text-right">Expected</th>
                  <th className="px-2 py-2 text-right">Due / ahead</th>
                  <th className="px-2 py-2">Paid through</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className={m.active ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 sm:px-2">
                      <Link href={`/admin/members/${m.id}`} className="font-medium text-slate-900 hover:text-teal-700">
                        {m.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {m.phone} {!m.active && <Badge label="INACTIVE" />}
                        {m.pendingCount > 0 && <span className="ml-1 text-amber-600">· {m.pendingCount} pending</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium">{$(m.ledger.paid)}</td>
                    <td className="px-2 py-2.5 text-right text-slate-500">{$(m.ledger.expected)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold">
                      {m.ledger.due > 0 ? (
                        <span className="text-red-600">−{$(m.ledger.due)}</span>
                      ) : m.ledger.advance > 0 ? (
                        <span className="text-emerald-700">+{$(m.ledger.advance)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {m.ledger.paidThrough ? monthLabel(m.ledger.paidThrough) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Add a member">
        <ActionForm action={addMember} submitLabel="Add member">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelClass}>Full name</label>
              <input id="name" name="name" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>Phone (used to log in)</label>
              <input id="phone" name="phone" type="tel" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>Email <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="email" name="email" type="email" className={inputClass} />
            </div>
            <div>
              <label htmlFor="joinMonth" className={labelClass}>First deposit month</label>
              <input id="joinMonth" name="joinMonth" type="month" required defaultValue={settings.startMonth > currentMonth() ? settings.startMonth : currentMonth()} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="password" className={labelClass}>Starting password</label>
              <input id="password" name="password" type="text" required minLength={8} autoComplete="off" className={inputClass} />
              <p className="mt-1 text-xs text-slate-500">They can change it from their Account page after logging in.</p>
            </div>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
