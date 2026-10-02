"use server";

import { revalidatePath } from "next/cache";
import { InvestmentKind, VoteRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary } from "@/lib/society";
import { tally } from "@/lib/votes";
import { audit } from "@/lib/audit";
import { closedMonthError } from "@/lib/locks";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}

/** Proposes an investment and opens a vote. A vote notice goes on the notice board automatically. */
export async function proposeInvestment(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const kind = String(formData.get("kind") ?? "") as InvestmentKind;
  const name = String(formData.get("name") ?? "").trim();
  const plan = String(formData.get("plan") ?? "").trim() || null;
  const details = String(formData.get("details") ?? "").trim() || null;
  const amount = Number(formData.get("amount"));
  const voteRule = String(formData.get("voteRule") ?? "") as VoteRule;
  const endsRaw = String(formData.get("voteEndsAt") ?? "");
  const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);

  if (!Object.values(InvestmentKind).includes(kind)) return { error: "Choose land, business or shares." };
  if (!name) return { error: "Name the investment." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount needed." };
  if (!Object.values(VoteRule).includes(voteRule)) return { error: "Choose how members must approve." };
  if (!endsRaw) return { error: "Choose when voting ends." };
  const fund = await fundSummary();
  if (amount > fund.cash) return { error: `Not enough cash: ${money(fund.cash, settings.currencySymbol)} available.` };

  const voteEndsAt = new Date(`${endsRaw}T23:59:59`);
  const investment = await prisma.investment.create({ data: { kind, name, plan, details, amount, voteRule, voteEndsAt } });
  try {
    for (const file of files) {
      const filePath = await saveFile("documents", file);
      await prisma.document.create({
        data: { assetType: kind, investmentId: investment.id, docType: "Proposal document", title: file.name.replace(/\.[^.]+$/, ""), filePath },
      });
    }
  } catch (err) {
    if (err instanceof UploadError) return { error: `Proposal saved, but a document failed: ${err.message}` };
    throw err;
  }
  await prisma.notice.create({
    data: {
      kind: "VOTE",
      title: `Vote open: ${name}`,
      body: `${money(amount, settings.currencySymbol)}${plan ? ` · ${plan}` : ""}. Please vote in the Invest tab before ${voteEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`,
    },
  });
  await audit(admin.userId, "investment.proposed", `${admin.name} proposed “${name}” for ${money(amount, settings.currencySymbol)}`);
  revalidateAll();
  return { ok: "Sent to members for a vote." };
}

/** Closes the vote: invests the money if it passed, otherwise marks it rejected. */
export async function finishVote(id: string): Promise<void> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const inv = await prisma.investment.findUniqueOrThrow({ where: { id }, include: { votes: true } });
  if (inv.status !== "PROPOSED") return;
  const fund = await fundSummary();
  const t = tally(inv.votes, inv.voteRule, fund.activeMembers);
  const invest = t.passed && inv.amount <= fund.cash;
  await prisma.investment.update({ where: { id }, data: invest ? { status: "ACTIVE", startedAt: new Date() } : { status: "REJECTED" } });
  await prisma.notice.create({
    data: {
      kind: "DECISION",
      title: `${inv.name}: ${invest ? "approved" : "not approved"}`,
      body: `${t.yes} yes, ${t.no} no (needed ${t.needed}).${invest ? ` ${money(inv.amount, settings.currencySymbol)} has been invested.` : t.passed ? " Passed, but there wasn't enough cash; the admin will propose it again." : ""}`,
    },
  });
  await audit(admin.userId, "investment.vote_closed", `${admin.name} closed the vote on “${inv.name}”: ${t.yes} yes / ${t.no} no → ${invest ? "invested" : "not invested"}`);
  revalidateAll();
}

export async function updateValuation(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const value = Number(formData.get("value"));
  if (!Number.isFinite(value) || value < 0) return { error: "Enter the estimated value." };
  const inv = await prisma.investment.update({ where: { id }, data: { currentValue: value } });
  await audit(admin.userId, "investment.valued", `${admin.name} updated the value of “${inv.name}” to ${value}`);
  revalidateAll();
  return { ok: "Valuation updated." };
}

/** Profit paid out by a business (or dividends): recorded as income and shared by members. */
export async function recordProfit(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const amount = Number(formData.get("amount"));
  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(dateRaw) : new Date();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the profit received." };
  const locked = await closedMonthError(date);
  if (locked) return { error: locked };
  const inv = await prisma.investment.findUniqueOrThrow({ where: { id } });
  await prisma.income.create({ data: { kind: "INVESTMENT_PROFIT", amount, date, investmentId: id, description: `Profit from ${inv.name}`, account: String(formData.get("account") ?? "") || null } });
  await audit(admin.userId, "income.added", `${admin.name} recorded ${amount} profit from “${inv.name}”`);
  revalidateAll();
  return { ok: "Profit recorded and shared with members." };
}

/** Sold or ended: the money comes back into the fund; any gain or loss counts as profit. */
export async function closeInvestment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const returned = Number(formData.get("returned"));
  if (!Number.isFinite(returned) || returned < 0) return { error: "Enter how much came back into the fund." };
  const inv = await prisma.investment.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), returnedAmount: returned } });
  await audit(admin.userId, "investment.closed", `${admin.name} closed “${inv.name}”: ${returned} returned on ${inv.amount} invested`);
  revalidateAll();
  return { ok: "Closed. The money is back in the fund." };
}
