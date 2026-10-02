"use server";

import { revalidatePath } from "next/cache";
import { VoteRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword, temporaryPassword } from "@/lib/password";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { isMonthKey, monthLabel } from "@/lib/months";
import { audit } from "@/lib/audit";
import type { FormState } from "@/components/ActionForm";

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const societyName = String(formData.get("societyName") ?? "").trim();
  const monthlyAmount = Number(formData.get("monthlyAmount"));
  const currencySymbol = String(formData.get("currencySymbol") ?? "").trim();
  const startMonth = String(formData.get("startMonth") ?? "");
  const paymentInfo = String(formData.get("paymentInfo") ?? "").trim() || null;
  const reminderDay = Number(formData.get("reminderDay"));
  const defaultVoteRule = String(formData.get("defaultVoteRule") ?? "") as VoteRule;
  const cashAccounts = String(formData.get("cashAccounts") ?? "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n");

  if (!societyName) return { error: "Society name is required." };
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return { error: "Monthly deposit must be positive." };
  if (!currencySymbol) return { error: "Currency symbol is required." };
  if (!isMonthKey(startMonth)) return { error: "Choose the society's first month." };
  if (!Number.isInteger(reminderDay) || reminderDay < 1 || reminderDay > 28) return { error: "Reminder day must be 1–28." };
  if (!Object.values(VoteRule).includes(defaultVoteRule)) return { error: "Choose the default vote rule." };
  if (!cashAccounts) return { error: "List at least one account the society keeps money in." };

  const before = await getSettings();
  await prisma.setting.update({
    where: { id: 1 },
    data: { societyName, monthlyAmount, currencySymbol, startMonth, paymentInfo, reminderDay, defaultVoteRule, cashAccounts },
  });
  await audit(
    admin.userId,
    "settings.updated",
    `${admin.name} saved the society rules${before.monthlyAmount !== monthlyAmount ? ` (monthly deposit ${before.monthlyAmount} → ${monthlyAmount})` : ""}`
  );
  revalidatePath("/", "layout");
  return { ok: "Rules saved." };
}

/** Adds an incoming admin (log in by email, so a member can also be an admin with their own phone account). */
export async function addAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name) return { error: "Name is required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter an email address to log in with." };
  if (await prisma.user.findFirst({ where: { OR: [{ email }, { phone: email }] } })) return { error: "That email is already used." };
  const password = temporaryPassword();
  await prisma.user.create({
    data: { name, email, phone: email, role: "ADMIN", joinMonth: (await getSettings()).startMonth, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await audit(admin.userId, "admin.added", `${admin.name} added ${name} as an admin`);
  revalidatePath("/admin/settings");
  return { ok: `${name} can log in with ${email} and temporary password ${password}.` };
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
  const [fund, pending, withdrawals, closed] = await Promise.all([
    fundSummary(),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.findMany({ where: { status: { in: ["PENDING", "APPROVED"] } }, include: { member: { select: { name: true } } } }),
    prisma.monthClose.findMany({ select: { month: true } }),
  ]);
  const closedSet = new Set(closed.map((c) => c.month));
  const { monthRange, addMonths, currentMonth } = await import("@/lib/months");
  const openMonths = monthRange(settings.startMonth, addMonths(currentMonth(), -1)).filter((m) => !closedSet.has(m));
  const $ = (n: number) => money(n, settings.currencySymbol);
  const snapshot: Array<[string, string]> = [
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
