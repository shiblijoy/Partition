"use server";

import { revalidatePath } from "next/cache";
import { VoteRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword, temporaryPassword } from "@/lib/password";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { accountBalances } from "@/lib/books";
import { currentMonth, isMonthKey, monthLabel } from "@/lib/months";
import { normalizePhone } from "@/lib/phone";
import { revokeSessions } from "@/lib/session";
import { sendTemplate } from "@/lib/messaging";
import { attempt } from "@/lib/actions";
import { audit } from "@/lib/audit";
import type { FormState } from "@/components/ActionForm";

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const societyName = String(formData.get("societyName") ?? "").trim();
    const currencySymbol = String(formData.get("currencySymbol") ?? "").trim();
    const startMonth = String(formData.get("startMonth") ?? "");
    const paymentInfo = String(formData.get("paymentInfo") ?? "").trim() || null;
    const reminderDay = Number(formData.get("reminderDay"));
    const remindersOn = formData.get("remindersOn") === "on";
    const defaultVoteRule = String(formData.get("defaultVoteRule") ?? "") as VoteRule;
    const limitRaw = String(formData.get("dualApprovalLimit") ?? "").trim();
    const dualApprovalLimit = limitRaw ? Math.round(Number(limitRaw)) : null;

    if (!societyName) return { error: "Society name is required." };
    if (!currencySymbol) return { error: "Currency symbol is required." };
    if (!isMonthKey(startMonth)) return { error: "Choose the society's first month." };
    if (!Number.isInteger(reminderDay) || reminderDay < 1 || reminderDay > 28) return { error: "Reminder day must be 1–28." };
    if (!Object.values(VoteRule).includes(defaultVoteRule)) return { error: "Choose the default vote rule." };
    if (dualApprovalLimit != null && !(dualApprovalLimit > 0)) return { error: "The second-admin limit must be a positive amount, or empty for none." };

    const before = await getSettings();
    const data = { societyName, currencySymbol, startMonth, paymentInfo, reminderDay, remindersOn, defaultVoteRule, dualApprovalLimit };
    await prisma.setting.update({ where: { id: 1 }, data });
    const { rates, monthlyAmount, nextRate, ...old } = before;
    void rates; void monthlyAmount; void nextRate;
    await audit(admin.userId, "settings.updated", `${admin.name} saved the society rules`, { entity: "settings", before: old, after: data });
    revalidatePath("/", "layout");
    return { ok: "Rules saved." };
  });
}

/**
 * FR-SET-02 / BR-01: a new monthly amount applies from a chosen future month
 * only. Months before it keep the amount in force for them.
 */
export async function setMonthlyRate(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const fromMonth = String(formData.get("fromMonth") ?? "");
    const amount = Math.round(Number(formData.get("amount")));
    if (!isMonthKey(fromMonth) || fromMonth <= currentMonth()) return { error: "Choose a month after this one: a change can't apply to months already running or past." };
    if (!(amount > 0)) return { error: "Enter the new monthly amount." };
    const pending = await prisma.payment.count({ where: { forMonth: { gte: fromMonth }, status: { in: ["PENDING", "APPROVED"] } } });
    if (pending) return { error: `${pending} payment(s) were already made for ${monthLabel(fromMonth)} or later at the old amount. Choose a later month.` };
    await prisma.monthlyRate.upsert({ where: { fromMonth }, create: { fromMonth, amount, createdBy: admin.name }, update: { amount, createdBy: admin.name } });
    await audit(admin.userId, "settings.monthly_amount", `${admin.name} set the monthly deposit to ${amount} from ${monthLabel(fromMonth, "long")}`, { entity: "monthly_rate", after: { fromMonth, amount } });
    revalidatePath("/", "layout");
    return { ok: `From ${monthLabel(fromMonth, "long")} the monthly deposit is ${amount}. Earlier months keep their amount.` };
  });
}

export async function cancelMonthlyRate(fromMonth: string): Promise<void> {
  const admin = await requireAdmin();
  if (fromMonth <= currentMonth()) return; // only a change that hasn't started yet
  if (await prisma.payment.count({ where: { forMonth: { gte: fromMonth }, status: { in: ["PENDING", "APPROVED"] } } })) return;
  await prisma.monthlyRate.deleteMany({ where: { fromMonth } });
  await audit(admin.userId, "settings.monthly_amount", `${admin.name} cancelled the monthly deposit change from ${monthLabel(fromMonth, "long")}`);
  revalidatePath("/", "layout");
}

/**
 * FR-SET-03: adds an admin or a read-only auditor. They log in by email, so a
 * member can also be an admin with their own phone account. An admin's WhatsApp
 * number receives their login code.
 */
export async function addStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const role = formData.get("role") === "AUDITOR" ? "AUDITOR" : "ADMIN";
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const contactPhone = normalizePhone(String(formData.get("contactPhone") ?? "").trim()) || null;
    if (!name) return { error: "Name is required." };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter an email address to log in with." };
    if (contactPhone && !/^\+?\d{10,14}$/.test(contactPhone)) return { error: "Enter a valid WhatsApp number." };
    if (await prisma.user.findFirst({ where: { OR: [{ email }, { phone: email }] } })) return { error: "That email is already used." };
    const password = temporaryPassword();
    const user = await prisma.user.create({
      data: { name, email, phone: email, contactPhone, role, joinMonth: (await getSettings()).startMonth, passwordHash: await hashPassword(password), mustChangePassword: true },
    });
    await audit(admin.userId, "admin.added", `${admin.name} added ${name} as ${role === "ADMIN" ? "an admin" : "an auditor"}`, { entity: `user:${user.id}` });
    revalidatePath("/admin/settings");
    const sent = contactPhone ? await sendTemplate(contactPhone, "temp_password", [name.split(" ")[0], password], user.id) : null;
    return { ok: sent ? `${name} was sent a temporary password on ${sent === "WHATSAPP" ? "WhatsApp" : "SMS"}. They log in with ${email}.` : `${name} can log in with ${email} and temporary password ${password} (shown once).` };
  });
}

/** FR-SET-03: removes an admin or auditor; at least one admin must always remain. */
export async function removeStaff(userId: string): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === "ADMIN") {
      const others = await prisma.user.count({ where: { role: "ADMIN", active: true, NOT: { id: userId } } });
      if (others === 0) return { error: "There must always be at least one admin. Add another admin first." };
    }
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    await revokeSessions(userId);
    await audit(admin.userId, "admin.removed", `${admin.name} removed ${user.name}'s ${user.role === "ADMIN" ? "admin" : "auditor"} access`, { entity: `user:${userId}` });
    revalidatePath("/admin/settings");
    return { ok: "Access removed." };
  });
}

/** The admin's own WhatsApp number, for the 6-digit login code (FR-AUTH-07). */
export async function setMyContactPhone(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const contactPhone = normalizePhone(String(formData.get("contactPhone") ?? "").trim()) || null;
    if (contactPhone && !/^\+?\d{10,14}$/.test(contactPhone)) return { error: "Enter a valid WhatsApp number." };
    await prisma.user.update({ where: { id: admin.userId }, data: { contactPhone } });
    await audit(admin.userId, "admin.contact", `${admin.name} ${contactPhone ? "set" : "removed"} their WhatsApp number for login codes`);
    revalidatePath("/admin", "layout");
    return { ok: contactPhone ? "Saved. Your next login asks for a WhatsApp code (once WhatsApp is connected)." : "Removed." };
  });
}

/** Starts a handover: snapshots the figures both admins must confirm. */
export async function startHandover(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const toId = String(formData.get("toId") ?? "");
  const cashInHand = Number(formData.get("cashInHand") ?? 0) || 0;
  const to = await prisma.user.findFirst({ where: { id: toId, role: "ADMIN", active: true, NOT: { id: admin.userId } } });
  if (!to) return { error: "Choose the incoming admin (add them first)." };
  if (await prisma.handover.findFirst({ where: { completedAt: null } })) return { error: "A handover is already in progress." };

  const settings = await getSettings();
  const [fund, pending, withdrawals, closed, balances] = await Promise.all([
    fundSummary(),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.findMany({ where: { status: { in: ["PENDING", "APPROVED"] } }, include: { member: { select: { name: true } } } }),
    prisma.monthClose.findMany({ select: { month: true } }),
    accountBalances(),
  ]);
  const closedSet = new Set(closed.map((c) => c.month));
  const { monthRange, addMonths, currentMonth } = await import("@/lib/months");
  const openMonths = monthRange(settings.startMonth, addMonths(currentMonth(), -1)).filter((m) => !closedSet.has(m));
  const $ = (n: number) => money(n, settings.currencySymbol);
  const snapshot: Array<[string, string]> = [
    ...balances.filter((a) => a.active).map((a) => [`Cash: ${a.name}${a.last4 ? ` ••${a.last4}` : ""}`, $(a.balance)] as [string, string]),
    ["Cash in all accounts", $(fund.cash)],
    ["Invested", $(fund.invested)],
    ["Payments waiting for approval", String(pending)],
    ["Open withdrawal requests", withdrawals.length ? `${withdrawals.length} (${withdrawals.map((w) => w.member.name).join(", ")})` : "0"],
    ["Months not yet closed", openMonths.length ? openMonths.map((m) => monthLabel(m, "long")).join(", ") : "None"],
    ["Cash in hand to pass on", $(cashInHand)],
  ];
  await prisma.handover.create({ data: { fromId: admin.userId, toId, snapshot: JSON.stringify(snapshot) } });
  await audit(admin.userId, "handover.started", `${admin.name} started handing over to ${to.name}`);
  revalidatePath("/admin/settings");
  return { ok: "Handover report created. Both admins now confirm it." };
}

export async function confirmHandover(id: string): Promise<void> {
  const admin = await requireAdmin();
  const h = await prisma.handover.findUniqueOrThrow({ where: { id } });
  if (h.completedAt) return;
  if (admin.userId === h.fromId) await prisma.handover.update({ where: { id }, data: { outgoingConfirmedAt: new Date() } });
  else if (admin.userId === h.toId) await prisma.handover.update({ where: { id }, data: { incomingConfirmedAt: new Date() } });
  else return;
  await audit(admin.userId, "handover.confirmed", `${admin.name} confirmed the handover report`);
  revalidatePath("/admin/settings");
}

/** Both confirmed: the outgoing admin's admin login is switched off. Their member account, if any, is untouched. */
export async function completeHandover(id: string): Promise<void> {
  const admin = await requireAdmin();
  const h = await prisma.handover.findUniqueOrThrow({ where: { id } });
  if (h.completedAt || !h.outgoingConfirmedAt || !h.incomingConfirmedAt) return;
  if (admin.userId !== h.fromId && admin.userId !== h.toId) return;
  const from = await prisma.user.update({ where: { id: h.fromId }, data: { active: false } });
  await revokeSessions(h.fromId);
  await prisma.handover.update({ where: { id }, data: { completedAt: new Date() } });
  await audit(admin.userId, "handover.completed", `Handover complete: ${from.name}'s admin access removed. Report: ${h.snapshot}`);
  revalidatePath("/admin", "layout");
}

export async function cancelHandover(id: string): Promise<void> {
  const admin = await requireAdmin();
  await prisma.handover.deleteMany({ where: { id, completedAt: null } });
  await audit(admin.userId, "handover.cancelled", `${admin.name} cancelled a handover`);
  revalidatePath("/admin/settings");
}
