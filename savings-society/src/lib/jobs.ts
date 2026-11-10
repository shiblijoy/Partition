import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, money } from "@/lib/settings";
import { membersWithLedgers } from "@/lib/society";
import { closeVote } from "@/lib/services/investments";
import { adminIds, queueForAll, queueNotification } from "@/lib/notify";
import { deliver } from "@/lib/deliver";
import { isUniqueViolation } from "@/lib/errors";
import { currentMonth, monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";
import { rateFor } from "@/lib/rates";

/** Claims a once-only job (e.g. "reminder:2026-11"). False if it already ran. */
async function once(key: string): Promise<boolean> {
  try {
    await prisma.jobRun.create({ data: { key } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/**
 * Everything that happens on a schedule. Runs from the cron route (a systemd
 * timer on the server), and also in the background after page loads, at most
 * every 10 minutes, so nothing is missed if the timer isn't set up.
 */
export async function runDueJobs(now = new Date()) {
  const settings = await getSettings();
  const report: string[] = [];

  // FR-INV-05: at the deadline a vote is marked passed or failed and every member is told.
  const expired = await prisma.investment.findMany({ where: { status: "PROPOSED", voteEndsAt: { lt: now } } });
  for (const inv of expired) {
    await closeVote(settings, inv.id, null);
    report.push(`vote closed: ${inv.name}`);
  }

  // FR-NTF-03: monthly due reminders on WhatsApp, on the day the admin set.
  const month = currentMonth();
  if (settings.remindersOn && now.getDate() >= settings.reminderDay && (await once(`reminder:${month}`))) {
    const members = await membersWithLedgers(settings);
    const due = members.filter((m) => m.ledger.statusFor(month) === "due");
    const amount = money(rateFor(month, settings.rates), settings.currencySymbol);
    for (const m of due) {
      await queueNotification(prisma, {
        userId: m.id,
        kind: "reminder",
        title: "Deposit due",
        body: `Your ${monthLabel(month, "long")} deposit of ${amount} is due. Pay and upload the proof in the app.`,
        url: "/member/pay",
        whatsapp: { template: "payment_due", params: [m.name.split(" ")[0], monthLabel(month, "long"), amount] },
      });
    }
    report.push(`reminders: ${due.length}`);
  }

  // FR-INC-04: the admin is reminded 7 days before an FDR matures.
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const fdrs = await prisma.account.findMany({ where: { type: "FDR", active: true, maturesOn: { lte: soon } } });
  for (const f of fdrs) {
    if (await once(`fdr:${f.id}`)) {
      await queueForAll(prisma, await adminIds(), { kind: "fdr", title: "FDR matures soon", body: `${f.name} matures on ${fmtDate(f.maturesOn!)}. Record its profit and close or renew it.`, url: "/admin/income" });
      report.push(`fdr reminder: ${f.name}`);
    }
  }

  // BR-13: a member without a nominee can't stay active for more than 30 days.
  const noNominee = await prisma.user.findMany({ where: { role: "MEMBER", active: true, exit: null, nomineeName: null, createdAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } });
  for (const m of noNominee) {
    if (await once(`nominee:${m.id}`)) {
      await queueForAll(prisma, await adminIds(), { kind: "nominee", title: "Nominee missing", body: `${m.name} has had no nominee for over 30 days. Add one on their page.`, url: `/admin/members/${m.id}` });
      await queueNotification(prisma, { userId: m.id, kind: "nominee", title: "Add your nominee", body: "Please add a nominee under My profile → Edit my details.", url: "/member/profile" });
    }
  }

  // Retention (§5): expired sessions and login codes are purged after 30 days.
  const old = new Date(now.getTime() - 30 * 86_400_000);
  await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: old } }, { revokedAt: { lt: old } }] } });
  await prisma.loginCode.deleteMany({ where: { createdAt: { lt: old } } });

  const sent = await deliver();
  if (sent) report.push(`delivered: ${sent}`);
  return report;
}

let lastRun = 0;

/** Kicks off runDueJobs after the response, at most every 10 minutes per server. */
export function runDueJobsSoon() {
  if (Date.now() - lastRun < 10 * 60_000) return;
  lastRun = Date.now();
  after(() => runDueJobs().catch((err) => console.error("scheduled jobs", err)));
}
