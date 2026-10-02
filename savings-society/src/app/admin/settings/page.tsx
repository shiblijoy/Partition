import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDay } from "@/lib/format";
import { Card, Line, Notice, PageHeader, Pill, inputClass, labelClass, primaryButton, secondaryButton, textareaClass, VOTE_RULE_LABELS } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PrintButton } from "@/components/PrintButton";
import { ExportButtons } from "./ExportButtons";
import { addAdmin, cancelHandover, completeHandover, confirmHandover, startHandover, updateSettings } from "./actions";

export default async function SettingsPage() {
  const session = await requireAdmin();
  const [settings, admins, handover, lastDone] = await Promise.all([
    getSettings(),
    prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
    prisma.handover.findFirst({ where: { completedAt: null } }),
    prisma.handover.findFirst({ where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" } }),
  ]);
  const name = (id: string) => admins.find((a) => a.id === id)?.name ?? "—";
  const snapshot: Array<[string, string]> = handover ? JSON.parse(handover.snapshot) : [];
  const others = admins.filter((a) => a.active && a.id !== session.userId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" back={{ href: "/admin", label: "Dashboard" }} />

      <div className="flex flex-wrap items-start gap-6">
        <Card title="Society rules" className="flex-[1_1_420px]">
          <ActionForm action={updateSettings} submitLabel="Save rules" resetOnSuccess={false}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="societyName" className={labelClass}>Society name</label>
                <input id="societyName" name="societyName" required defaultValue={settings.societyName} className={inputClass} />
              </div>
              <div>
                <label htmlFor="monthlyAmount" className={labelClass}>Monthly deposit ({settings.currencySymbol})</label>
                <input id="monthlyAmount" name="monthlyAmount" type="number" min="1" required defaultValue={settings.monthlyAmount} className={inputClass} />
              </div>
              <div>
                <label htmlFor="reminderDay" className={labelClass}>Reminder day (due by)</label>
                <input id="reminderDay" name="reminderDay" type="number" min="1" max="28" required defaultValue={settings.reminderDay} className={inputClass} />
              </div>
              <div>
                <label htmlFor="startMonth" className={labelClass}>Society&apos;s first month</label>
                <input id="startMonth" name="startMonth" type="month" required defaultValue={settings.startMonth} className={inputClass} />
              </div>
              <div>
                <label htmlFor="currencySymbol" className={labelClass}>Currency symbol</label>
                <input id="currencySymbol" name="currencySymbol" required maxLength={4} defaultValue={settings.currencySymbol} className={inputClass} />
              </div>
            </div>
            <fieldset>
              <legend className={`${labelClass} mb-1`}>Default vote rule</legend>
              <div className="flex flex-wrap gap-4">
                {Object.entries(VOTE_RULE_LABELS).map(([v, l]) => (
                  <label key={v} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input type="radio" name="defaultVoteRule" value={v} defaultChecked={settings.defaultVoteRule === v} className="h-5 w-5 accent-brand" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="paymentInfo" className={labelClass}>Where members should send money</label>
              <textarea id="paymentInfo" name="paymentInfo" rows={3} defaultValue={settings.paymentInfo ?? ""} placeholder={"bKash (society): 01XXXXXXXXX\nBank: [Bank], A/C [number]"} className={textareaClass} />
            </div>
            <div id="accounts">
              <label htmlFor="cashAccounts" className={labelClass}>Society accounts (one per line, used when closing a month)</label>
              <textarea id="cashAccounts" name="cashAccounts" rows={3} required defaultValue={settings.cashAccounts} className={textareaClass} />
            </div>
            <Notice tone="warn">Changing the monthly deposit re-prices every month, including past ones. Change it only at the start of the society, or after a general meeting agrees.</Notice>
          </ActionForm>
        </Card>

        <div className="flex flex-[1_1_420px] flex-col gap-6">
          <Card title="Export all data">
            <p className="text-sm leading-relaxed">
              One Excel file with members, payments, ledger, expenses, income, investments, withdrawals, reconciliations and the audit log, plus a ZIP of every uploaded file. The society can keep it or move to another system with it.
            </p>
            <p className="mt-2 text-[13px] text-muted">{settings.lastExportAt ? `Last export: ${fmtDate(settings.lastExportAt)}` : "Not exported yet."}</p>
            <div className="mt-4"><ExportButtons /></div>
          </Card>

          <Card title="Admins & handover">
            <ul className="flex flex-col">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 border-b border-[#EFEDE6] py-2.5 last:border-0">
                  <div>
                    <div className="font-bold">{a.name}{a.id === session.userId && " (you)"}</div>
                    <div className="text-xs text-muted">{a.email ?? a.phone} · since {fmtDay(a.createdAt)}</div>
                  </div>
                  <Pill tone={!a.active ? "neutral" : handover?.fromId === a.id ? "warn" : "good"}>
                    {!a.active ? "Former admin" : handover?.fromId === a.id ? "Outgoing" : handover?.toId === a.id ? "Incoming" : "Admin"}
                  </Pill>
                </li>
              ))}
            </ul>

            <details className="mt-4">
              <summary className={`${secondaryButton} cursor-pointer list-none`}>Add an admin</summary>
              <ActionForm action={addAdmin} submitLabel="Add admin" className="mt-3 flex flex-col gap-3">
                <div>
                  <label htmlFor="a-name" className={labelClass}>Name</label>
                  <input id="a-name" name="name" required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="a-email" className={labelClass}>Email (admin login)</label>
                  <input id="a-email" name="email" type="email" required className={inputClass} />
                </div>
                <p className="text-xs text-muted">Admins log in with email, so a member can also be an admin and keep their member account.</p>
              </ActionForm>
            </details>

            {handover ? (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold">Handover report · {fmtDate(handover.createdAt)}</h3>
                  <div className="no-print"><PrintButton label="Download report (PDF)" /></div>
                </div>
                <p className="text-[13px] text-muted">{name(handover.fromId)} → {name(handover.toId)}</p>
                <div>{snapshot.map(([k, v]) => <Line key={k} label={k} value={v} />)}</div>
                <ul className="flex flex-col gap-2 text-sm">
                  <li className={handover.outgoingConfirmedAt ? "font-bold text-good" : "text-muted"}>
                    {handover.outgoingConfirmedAt ? "✓" : "○"} Outgoing admin confirms the report
                  </li>
                  <li className={handover.incomingConfirmedAt ? "font-bold text-good" : "text-muted"}>
                    {handover.incomingConfirmedAt ? "✓" : "○"} Incoming admin confirms the report and cash received
                  </li>
                </ul>
                <div className="flex flex-wrap gap-2">
                  {((session.userId === handover.fromId && !handover.outgoingConfirmedAt) || (session.userId === handover.toId && !handover.incomingConfirmedAt)) && (
                    <form action={confirmHandover.bind(null, handover.id)}>
                      <button className={primaryButton}>I confirm this report</button>
                    </form>
                  )}
                  {handover.outgoingConfirmedAt && handover.incomingConfirmedAt && (
                    <ConfirmButton action={completeHandover.bind(null, handover.id)} confirmText={`Remove ${name(handover.fromId)}'s admin access? Their member account (if any) is unaffected.`} className={primaryButton}>
                      Complete handover &amp; remove old admin&apos;s access
                    </ConfirmButton>
                  )}
                  <ConfirmButton action={cancelHandover.bind(null, handover.id)} confirmText="Cancel this handover?" className={secondaryButton}>Cancel</ConfirmButton>
                </div>
              </div>
            ) : (
              <details className="mt-3">
                <summary className={`${secondaryButton} cursor-pointer list-none`}>Hand over to another admin</summary>
                <ActionForm action={startHandover} submitLabel="Create handover report" className="mt-3 flex flex-col gap-3">
                  <div>
                    <label htmlFor="h-to" className={labelClass}>Incoming admin</label>
                    <select id="h-to" name="toId" required className={inputClass}>
                      {others.length === 0 && <option value="">Add the incoming admin first</option>}
                      {others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="h-cash" className={labelClass}>Cash in hand to pass on ({settings.currencySymbol})</label>
                    <input id="h-cash" name="cashInHand" type="number" min="0" defaultValue={0} className={inputClass} />
                  </div>
                </ActionForm>
              </details>
            )}
            {lastDone && !handover && (
              <p className="mt-3 text-[13px] text-muted">Last handover completed {fmtDate(lastDone.completedAt!)}: {name(lastDone.fromId)} → {name(lastDone.toId)}. The report is saved in the audit log.</p>
            )}
          </Card>

          <Card title="My password">
            <a href="/password" className={`${secondaryButton} no-underline`}>Change my password</a>
          </Card>
        </div>
      </div>
    </div>
  );
}
