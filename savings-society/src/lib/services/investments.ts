import type { InvestmentKind, VoteRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountOrDefault, allocate, cashAt, post, type Db } from "@/lib/books";
import { fundSummary, CURRENT_MEMBER } from "@/lib/society";
import { tally } from "@/lib/votes";
import { audit } from "@/lib/audit";
import { queueForAll } from "@/lib/notify";
import { ServiceError } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { money, type Settings } from "@/lib/settings";
import { addIncome } from "@/lib/services/books";
import { inTx, type Actor } from "@/lib/services/payments";

async function memberIds(db: Db) {
  return (await db.user.findMany({ where: { role: "MEMBER", ...CURRENT_MEMBER }, select: { id: true } })).map((m) => m.id);
}

/**
 * NFR-SEC-07: above the society's limit a second, different admin must confirm.
 * Returns true when this admin's confirmation completes the approval.
 */
export function secondApproval(limit: number | null, amount: number, first: string | null, actor: Actor): "first" | "complete" {
  if (limit == null || amount <= limit) return "complete";
  if (!first) return "first";
  if (first === actor.id) throw new ServiceError("A different admin must give the second confirmation.");
  return "complete";
}

/** FR-INV-01..03: a proposal opens a vote; FR-INV-02 blocks one larger than the cash available. */
export async function proposeInvestment(
  settings: Settings,
  p: { kind: InvestmentKind; name: string; plan: string | null; details: string | null; amount: number; voteRule: VoteRule; voteEndsAt: Date; actor: Actor }
) {
  const amount = Math.round(p.amount);
  if (!p.name.trim()) throw new ServiceError("Name the investment.");
  if (!(amount > 0)) throw new ServiceError("Enter the amount needed.");
  if (p.voteEndsAt <= new Date()) throw new ServiceError("Voting must end in the future.");
  return inTx(async (tx) => {
    const fund = await fundSummary(tx);
    if (amount > fund.cash) throw new ServiceError(`Not enough cash: ${money(fund.cash, settings.currencySymbol)} available.`);
    const inv = await tx.investment.create({ data: { kind: p.kind, name: p.name, plan: p.plan, details: p.details, amount, voteRule: p.voteRule, voteEndsAt: p.voteEndsAt } });
    await tx.notice.create({
      data: {
        kind: "VOTE",
        title: `Vote open: ${p.name}`,
        body: `${money(amount, settings.currencySymbol)}${p.plan ? ` · ${p.plan}` : ""}. Please vote in the Invest tab before ${fmtDate(p.voteEndsAt)}. The documents are under Asset documents.`,
        investmentId: inv.id,
      },
    });
    await queueForAll(tx, await memberIds(tx), { kind: "vote_opened", title: "New vote", body: `Vote on “${p.name}” before ${fmtDate(p.voteEndsAt)}.`, url: "/member/invest" });
    await audit(p.actor.id, "investment.proposed", `${p.actor.name} proposed “${p.name}” for ${money(amount, settings.currencySymbol)}`, { db: tx, entity: `investment:${inv.id}`, after: inv });
    return inv;
  });
}

/**
 * FR-INV-05: closes the vote (at the deadline, automatically, or early by the
 * admin) and tells every member. A passed proposal waits for the admin to
 * record the money paid out (FR-INV-06).
 */
export async function closeVote(settings: Settings, id: string, actor: Actor | null) {
  return inTx(async (tx) => {
    const inv = await tx.investment.findUnique({ where: { id }, include: { votes: true } });
    if (!inv || inv.status !== "PROPOSED") return null;
    const members = await memberIds(tx);
    const t = tally(inv.votes.filter((v) => members.includes(v.memberId)), inv.voteRule, members.length);
    await tx.investment.update({ where: { id }, data: { status: t.passed ? "PASSED" : "REJECTED", voteClosedAt: new Date() } });
    const body = `${t.yes} yes, ${t.no} no (needed ${t.needed}).${t.passed ? ` The admin will now invest ${money(inv.amount, settings.currencySymbol)}.` : ""}`;
    await tx.notice.create({ data: { kind: "DECISION", title: `${inv.name}: ${t.passed ? "approved" : "not approved"}`, body, investmentId: id } });
    await queueForAll(tx, members, { kind: "vote_closed", title: "Vote result", body: `“${inv.name}” was ${t.passed ? "approved" : "not approved"}.`, url: "/member/notices" });
    await audit(actor?.id ?? null, "investment.vote_closed", `${actor ? actor.name : "Voting deadline"} closed the vote on “${inv.name}”: ${t.yes} yes / ${t.no} no → ${t.passed ? "passed" : "failed"}`, { db: tx, entity: `investment:${id}` });
    return t;
  });
}

/** FR-INV-06: records the money paid out for a passed proposal; it becomes an active investment. */
export async function startInvestment(settings: Settings, id: string, i: { accountId?: string | null; date: Date; actor: Actor }) {
  return inTx(async (tx) => {
    const inv = await tx.investment.findUnique({ where: { id } });
    if (!inv || inv.status !== "PASSED") throw new ServiceError("Only a proposal members approved can be invested.");
    const accountId = await accountOrDefault(tx, i.accountId);
    if (inv.amount > (await cashAt(tx, undefined, accountId))) throw new ServiceError("That account doesn't hold enough. Move money into it first, or choose another account.");
    if (inv.amount > (await fundSummary(tx)).cash) throw new ServiceError("Not enough cash available (BR-07).");
    if (secondApproval(settings.dualApprovalLimit, inv.amount, inv.firstApprover, i.actor) === "first") {
      await tx.investment.update({ where: { id }, data: { firstApprover: i.actor.id, accountId } });
      await audit(i.actor.id, "investment.first_approval", `${i.actor.name} approved investing in “${inv.name}”; a second admin must confirm`, { db: tx, entity: `investment:${id}` });
      return "waiting" as const;
    }
    await post(tx, { date: i.date, type: "INVEST_OUT", amount: -inv.amount, accountId, sourceType: "investment", sourceId: id, note: inv.name, createdBy: i.actor.name });
    await tx.investment.update({ where: { id }, data: { status: "ACTIVE", startedAt: i.date, accountId } });
    await audit(i.actor.id, "investment.started", `${i.actor.name} paid ${money(inv.amount, settings.currencySymbol)} into “${inv.name}”`, { db: tx, entity: `investment:${id}` });
    return "invested" as const;
  });
}

/** The admin withdraws a proposal (before or after the vote). */
export async function withdrawProposal(id: string, actor: Actor) {
  return inTx(async (tx) => {
    const inv = await tx.investment.findUnique({ where: { id } });
    if (!inv || (inv.status !== "PROPOSED" && inv.status !== "PASSED")) throw new ServiceError("Only a proposal can be withdrawn.");
    await tx.investment.update({ where: { id }, data: { status: "REJECTED" } });
    await audit(actor.id, "investment.withdrawn", `${actor.name} withdrew the proposal “${inv.name}”`, { db: tx, entity: `investment:${id}` });
  });
}

export async function recordValuation(id: string, value: number, actor: Actor) {
  if (!Number.isFinite(value) || value < 0) throw new ServiceError("Enter the estimated value.");
  return inTx(async (tx) => {
    const inv = await tx.investment.update({ where: { id }, data: { currentValue: Math.round(value) } });
    await tx.valuation.create({ data: { investmentId: id, value: Math.round(value), recordedBy: actor.name } });
    await audit(actor.id, "investment.valued", `${actor.name} updated the value of “${inv.name}” to ${Math.round(value)} (estimate, not profit until sold)`, { db: tx, entity: `investment:${id}` });
  });
}

/** FR-INV-07: profit paid by a business (or dividends) is income, shared among members active on that day. */
export async function recordProfit(settings: Settings, id: string, p: { amount: number; date: Date; accountId?: string | null; actor: Actor }) {
  const inv = await prisma.investment.findUniqueOrThrow({ where: { id } });
  return addIncome(settings, { kind: "INVESTMENT_PROFIT", amount: p.amount, date: p.date, accountId: p.accountId, investmentId: id, description: `Profit from ${inv.name}`, filePath: null, actor: p.actor });
}

/** FR-INV-08: sold or ended. The money returned comes back in; the gain (or loss) is shared as profit. */
export async function closeInvestment(settings: Settings, id: string, c: { returned: number; date: Date; accountId?: string | null; actor: Actor }) {
  const returned = Math.round(c.returned);
  if (!Number.isFinite(returned) || returned < 0) throw new ServiceError("Enter how much came back into the fund.");
  return inTx(async (tx) => {
    const inv = await tx.investment.findUnique({ where: { id } });
    if (!inv || inv.status !== "ACTIVE") throw new ServiceError("Only an active investment can be closed.");
    const accountId = await accountOrDefault(tx, c.accountId);
    if (returned > 0) await post(tx, { date: c.date, type: "CAPITAL_BACK", amount: returned, accountId, sourceType: "investment", sourceId: id, note: inv.name, createdBy: c.actor.name });
    await tx.investment.update({ where: { id }, data: { status: "CLOSED", closedAt: c.date, returnedAmount: returned } });
    await allocate(tx, { sourceType: "gain", sourceId: id, taka: returned - inv.amount, date: c.date });
    await audit(c.actor.id, "investment.closed", `${c.actor.name} closed “${inv.name}”: ${money(returned, settings.currencySymbol)} returned on ${money(inv.amount, settings.currencySymbol)} invested`, { db: tx, entity: `investment:${id}` });
  });
}
