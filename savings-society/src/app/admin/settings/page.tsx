import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { addMonths, currentMonth, monthLabel } from "@/lib/months";
import { fmtDate, fmtDay } from "@/lib/format";
import { whatsappConfigured } from "@/lib/messaging";
import { pushConfigured } from "@/lib/push";
import { Card, Line, Notice, PageHeader, Pill, inputClass, labelClass, primaryButton, secondaryButton, smallSecondary, textareaClass, VOTE_RULE_LABELS } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PrintButton } from "@/components/PrintButton";
import { ExportButtons } from "./ExportButtons";
import { addStaff, cancelHandover, cancelMonthlyRate, completeHandover, confirmHandover, removeStaff, setMonthlyRate, setMyContactPhone, startHandover, updateSettings } from "./actions";

export default async function SettingsPage() {
  const session = await requireStaff();
  const canEdit = session.role === "ADMIN";
  const [settings, staff, handover, lastDone, me] = await Promise.all([
    getSettings(),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "AUDITOR"] } }, orderBy: { createdAt: "asc" } }),
    prisma.handover.findFirst({ where: { completedAt: null } }),
    prisma.handover.findFirst({ where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" } }),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
  ]);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const name = (id: string) => staff.find((a) => a.id === id)?.name ?? "—";
  const snapshot: Array<[string, string]> = handover ? JSON.parse(handover.snapshot) : [];
  const others = staff.filter((a) => a.active && a.role === "ADMIN" && a.id !== session.userId);
  const now = currentMonth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" back={{ href: "/admin", label: "Dashboard" }} />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-[1_1_420px] flex-col gap-6">
          <Card title="Society rules">
            <ActionForm action={updateSettings} submitLabel="Save rules" resetOnSuccess={false}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="societyName" className={labelClass}>Society name</label>
                  <input id="societyName" name="societyName" required defaultValue={settings.societyName} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="reminderDay" className={labelClass}>Reminder day (deposits due by)</label>
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
                <div>
                  <label htmlFor="dualApprovalLimit" className={labelClass}>Second admin needed above ({settings.currencySymbol})</label>
                  <input id="dualApprovalLimit" name="dualApprovalLimit" type="number" min="1" defaultValue={settings.dualApprovalLimit ?? ""} placeholder="No limit" className={inputClass} />
                </div>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                <input type="checkbox" name="remindersOn" defaultChecked={settings.remindersOn} className="h-5 w-5 accent-brand" />
                Send due reminders automatically on the reminder day{whatsappConfigured() ? " (WhatsApp and the app)" : " (in the app; WhatsApp once connected)"}
              </label>
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
                <textarea id="paymentInfo" name="paymentInfo" rows={3} defaultValue={settings.paymentInfo ?? ""} placeholder={"Bank: [Bank name], [Branch]\nA/C name: [Society name]\nA/C ending [4 digits]"} className={textareaClass} />
              </div>
              <p className="text-[13px] text-muted">Society accounts are managed on <a href="/admin/accounts">Accounts &amp; ledger</a>.</p>
            </ActionForm>
          </Card>

          <Card title="Monthly deposit">
            <ul className="flex flex-col">
              {settings.rates.map((r) => (
                <li key={r.fromMonth} className="flex items-center justify-between gap-2 border-b border-[#EFEDE6] py-2 text-sm last:border-0">
                  <span>From {monthLabel(r.fromMonth, "long")}: <strong>{$(r.amount)}</strong>{r.fromMonth > now && <span className="text-warn"> · upcoming</span>}</span>
                  {canEdit && r.fromMonth > now && <ConfirmButton action={cancelMonthlyRate.bind(null, r.fromMonth)} confirmText="Cancel this change?" className={smallSecondary}>Cancel</ConfirmButton>}
                </li>
              ))}
            </ul>
            {canEdit && (
              <ActionForm action={setMonthlyRate} submitLabel="Set new amount" buttonClass={secondaryButton} className="mt-4 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rate-from" className={labelClass}>From month</label>
                    <input id="rate-from" name="fromMonth" type="month" required min={addMonths(now, 1)} defaultValue={addMonths(now, 1)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="rate-amount" className={labelClass}>New amount ({settings.currencySymbol})</label>
                    <input id="rate-amount" name="amount" type="number" min="1" required className={inputClass} />
                  </div>
                </div>
                <p className="text-xs text-muted">A change applies from a future month only. Earlier months keep the amount that was in force for them, and every payment stores its own amount.</p>
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="flex flex-[1_1_420px] flex-col gap-6">
          <Card title="Export all data">
            <p className="text-sm leading-relaxed">One Excel file with members, payments, the ledger, accounts, expenses, income, investments, withdrawals, receipts, reconciliations and the audit log, plus a ZIP of every uploaded file. The society can keep it or move to another system with it.</p>
            <p className="mt-2 text-[13px] text-muted">{settings.lastExportAt ? `Last export: ${fmtDate(settings.lastExportAt)}` : "Not exported yet."}</p>
            <div className="mt-4"><ExportButtons /></div>
          </Card>

          <Card title="Connections">
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex justify-between gap-2"><span>WhatsApp Business (codes, passwords, reminders)</span><Pill tone={whatsappConfigured() ? "good" : "neutral"}>{whatsappConfigured() ? "Connected" : "Not set up"}</Pill></li>
              <li className="flex justify-between gap-2"><span>SMS fallback</span><Pill tone={process.env.SMS_GATEWAY_URL ? "good" : "neutral"}>{process.env.SMS_GATEWAY_URL ? "Connected" : "Not set up"}</Pill></li>
              <li className="flex justify-between gap-2"><span>Push notifications</span><Pill tone={pushConfigured() ? "good" : "neutral"}>{pushConfigured() ? "On" : "Not set up"}</Pill></li>
            </ul>
            <p className="mt-2 text-xs text-muted">Set up in the server&apos;s .env file — see DEPLOY.md.</p>
          </Card>

          <Card title="Admins, auditors & handover">
            <ul className="flex flex-col">
              {staff.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 border-b border-[#EFEDE6] py-2.5 last:border-0">
                  <div>
                    <div className="font-bold">{a.name}{a.id === session.userId && " (you)"}</div>
                    <div className="text-xs text-muted">{a.email ?? a.phone}{a.contactPhone && ` · WhatsApp ${a.contactPhone}`} · since {fmtDay(a.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={!a.active ? "neutral" : handover?.fromId === a.id ? "warn" : "good"}>
                      {!a.active ? "Removed" : handover?.fromId === a.id ? "Outgoing" : handover?.toId === a.id ? "Incoming" : a.role === "AUDITOR" ? "Auditor" : "Admin"}
                    </Pill>
                    {canEdit && a.active && a.id !== session.userId && (
                      <ActionForm action={removeStaff.bind(null, a.id)} submitLabel="Remove" buttonClass={smallSecondary} className="flex"><span className="sr-only">Remove access</span></ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {canEdit && (
              <details className="mt-4">
                <summary className={`${secondaryButton} cursor-pointer list-none`}>Add an admin or auditor</summary>
                <ActionForm action={addStaff} submitLabel="Add" className="mt-3 flex flex-col gap-3">
                  <fieldset className="flex gap-4">
                    <legend className="sr-only">Role</legend>
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="radio" name="role" value="ADMIN" defaultChecked className="h-5 w-5 accent-brand" /> Admin</label>
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="radio" name="role" value="AUDITOR" className="h-5 w-5 accent-brand" /> Auditor (read-only)</label>
                  </fieldset>
                  <div>
                    <label htmlFor="a-name" className={labelClass}>Name</label>
                    <input id="a-name" name="name" required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="a-email" className={labelClass}>Email (login)</label>
                    <input id="a-email" name="email" type="email" required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="a-phone" className={labelClass}>WhatsApp number (login codes, temporary password)</label>
                    <input id="a-phone" name="contactPhone" type="tel" className={inputClass} />
                  </div>
                </ActionForm>
              </details>
            )}

            {handover ? (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold">Handover report · {fmtDate(handover.createdAt)}</h3>
                  <div className="no-print"><PrintButton label="Download report (PDF)" /></div>
                </div>
                <p className="text-[13px] text-muted">{name(handover.fromId)} → {name(handover.toId)}</p>
                <div>{snapshot.map(([k, v]) => <Line key={k} label={k} value={v} />)}</div>
                <ul className="flex flex-col gap-2 text-sm">
                  <li className={handover.outgoingConfirmedAt ? "font-bold text-good" : "text-muted"}>{handover.outgoingConfirmedAt ? "✓" : "○"} Outgoing admin confirms the report</li>
                  <li className={handover.incomingConfirmedAt ? "font-bold text-good" : "text-muted"}>{handover.incomingConfirmedAt ? "✓" : "○"} Incoming admin confirms the report and cash received</li>
                </ul>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {((session.userId === handover.fromId && !handover.outgoingConfirmedAt) || (session.userId === handover.toId && !handover.incomingConfirmedAt)) && (
                      <form action={confirmHandover.bind(null, handover.id)}><button className={primaryButton}>I confirm this report</button></form>
                    )}
                    {handover.outgoingConfirmedAt && handover.incomingConfirmedAt && (
                      <ConfirmButton action={completeHandover.bind(null, handover.id)} confirmText={`Remove ${name(handover.fromId)}'s admin access? Their member account (if any) is unaffected.`} className={primaryButton}>
                        Complete handover &amp; remove old admin&apos;s access
                      </ConfirmButton>
                    )}
                    <ConfirmButton action={cancelHandover.bind(null, handover.id)} confirmText="Cancel this handover?" className={secondaryButton}>Cancel</ConfirmButton>
                  </div>
                )}
              </div>
            ) : canEdit ? (
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
            ) : null}
            {lastDone && !handover && <p className="mt-3 text-[13px] text-muted">Last handover completed {fmtDate(lastDone.completedAt!)}: {name(lastDone.fromId)} → {name(lastDone.toId)}. The report is saved in the audit log.</p>}
          </Card>

          <Card title="My account">
            <div id="me" className="flex flex-col gap-4">
              {canEdit && (
                <ActionForm action={setMyContactPhone} submitLabel="Save WhatsApp number" buttonClass={secondaryButton} resetOnSuccess={false} className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="me-phone" className={labelClass}>My WhatsApp number (receives the 6-digit login code)</label>
                    <input id="me-phone" name="contactPhone" type="tel" defaultValue={me.contactPhone ?? ""} className={inputClass} />
                  </div>
                </ActionForm>
              )}
              {!whatsappConfigured() && <Notice tone="neutral">Two-step login turns on once WhatsApp is connected and your number is saved.</Notice>}
              <a href="/password" className={`${secondaryButton} no-underline`}>Change my password</a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
