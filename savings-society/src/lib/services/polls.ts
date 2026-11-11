import type { Poll, PollAudience, PollOption, PollVote } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CURRENT_MEMBER } from "@/lib/society";
import { audit } from "@/lib/audit";
import { queueForAll } from "@/lib/notify";
import { ServiceError } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import type { Actor } from "@/lib/services/payments";

export type PollState = "upcoming" | "open" | "closed" | "cancelled";

export function pollState(p: Pick<Poll, "opensAt" | "closesAt" | "cancelledAt">, now = new Date()): PollState {
  if (p.cancelledAt) return "cancelled";
  if (now < p.opensAt) return "upcoming";
  if (now < p.closesAt) return "open";
  return "closed";
}

/** Who votes in a poll: current members, or the active admins. */
export async function pollVoterIds(audience: PollAudience): Promise<string[]> {
  const where = audience === "ADMINS" ? { role: "ADMIN" as const, active: true } : { role: "MEMBER" as const, ...CURRENT_MEMBER };
  return (await prisma.user.findMany({ where, select: { id: true } })).map((u) => u.id);
}

export type PollResult = {
  counts: Array<{ optionId: string; label: string; votes: number }>;
  total: number;
  winners: string[]; // labels with the most votes (several on a tie, none without votes)
};

/** Counts per choice. Staff see these; members see only `winners` once the poll has closed. */
export function pollResult(p: { options: PollOption[]; votes: Pick<PollVote, "optionId">[] }): PollResult {
  const counts = [...p.options]
    .sort((a, b) => a.position - b.position)
    .map((o) => ({ optionId: o.id, label: o.label, votes: p.votes.filter((v) => v.optionId === o.id).length }));
  const top = Math.max(0, ...counts.map((c) => c.votes));
  return { counts, total: p.votes.length, winners: top > 0 ? counts.filter((c) => c.votes === top).map((c) => c.label) : [] };
}

export async function createPoll(input: { question: string; details: string | null; audience: PollAudience; options: string[]; opensAt: Date; closesAt: Date; actor: Actor }) {
  const question = input.question.trim();
  const options = [...new Set(input.options.map((o) => o.trim()).filter(Boolean))];
  if (!question) throw new ServiceError("Write the question.");
  if (options.length < 2) throw new ServiceError("Give at least two choices, one per line.");
  if (options.length > 10) throw new ServiceError("Ten choices at most.");
  if (Number.isNaN(input.opensAt.getTime()) || Number.isNaN(input.closesAt.getTime())) throw new ServiceError("Choose when voting opens and closes.");
  if (input.closesAt <= input.opensAt) throw new ServiceError("Voting must close after it opens.");
  if (input.closesAt <= new Date()) throw new ServiceError("The closing time has already passed.");

  const poll = await prisma.poll.create({
    data: {
      question,
      details: input.details?.trim() || null,
      audience: input.audience,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      createdById: input.actor.id,
      options: { create: options.map((label, position) => ({ label, position })) },
    },
  });
  await audit(input.actor.id, "poll.created", `${input.actor.name} created the poll “${question}” (${input.audience === "ADMINS" ? "admins only" : "all members"}, ${fmtDateTime(input.opensAt)} – ${fmtDateTime(input.closesAt)})`, { entity: `poll:${poll.id}`, after: { question, options, audience: input.audience } });
  await notifyPolls(); // tells voters straight away if it's already open
  return poll;
}

/** One vote per person; it can be changed until the poll closes. Votes are never shown by name. */
export async function castPollVote(pollId: string, userId: string, optionId: string) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { options: true } });
  if (!poll) throw new ServiceError("That poll doesn't exist.");
  const state = pollState(poll);
  if (state === "upcoming") throw new ServiceError(`Voting opens ${fmtDateTime(poll.opensAt)}.`);
  if (state !== "open") throw new ServiceError("Voting has closed.");
  if (!poll.options.some((o) => o.id === optionId)) throw new ServiceError("Choose one of the options.");
  if (!(await pollVoterIds(poll.audience)).includes(userId)) throw new ServiceError(poll.audience === "ADMINS" ? "Only the admins vote in this poll." : "Only current members vote in this poll.");
  await prisma.pollVote.upsert({ where: { pollId_userId: { pollId, userId } }, create: { pollId, userId, optionId }, update: { optionId } });
}

/** Ends voting now (the result is shown as it stands). */
export async function closePollNow(pollId: string, actor: Actor) {
  const poll = await prisma.poll.findUniqueOrThrow({ where: { id: pollId } });
  if (pollState(poll) !== "open") throw new ServiceError("Only an open poll can be ended early.");
  await prisma.poll.update({ where: { id: pollId }, data: { closesAt: new Date() } });
  await audit(actor.id, "poll.closed", `${actor.name} ended the poll “${poll.question}” early`, { entity: `poll:${pollId}` });
  await notifyPolls();
}

export async function cancelPoll(pollId: string, actor: Actor) {
  const poll = await prisma.poll.findUniqueOrThrow({ where: { id: pollId } });
  if (poll.cancelledAt) return;
  if (pollState(poll) === "closed") throw new ServiceError("A closed poll can't be cancelled; its result stands.");
  await prisma.poll.update({ where: { id: pollId }, data: { cancelledAt: new Date() } });
  await audit(actor.id, "poll.cancelled", `${actor.name} cancelled the poll “${poll.question}”`, { entity: `poll:${pollId}` });
}

/** Runs with the scheduled jobs: tells voters when a poll opens and when its result is in. */
export async function notifyPolls(now = new Date()): Promise<number> {
  let sent = 0;
  const opened = await prisma.poll.findMany({ where: { cancelledAt: null, openNotifiedAt: null, opensAt: { lte: now }, closesAt: { gt: now } } });
  for (const p of opened) {
    const { count } = await prisma.poll.updateMany({ where: { id: p.id, openNotifiedAt: null }, data: { openNotifiedAt: now } });
    if (!count) continue;
    const ids = await pollVoterIds(p.audience);
    await queueForAll(prisma, ids, { kind: "poll", title: "New poll: please vote", body: `${p.question} · voting closes ${fmtDateTime(p.closesAt)}`, url: p.audience === "ADMINS" ? "/admin/polls" : "/member/vote" });
    sent += ids.length;
  }
  const ended = await prisma.poll.findMany({ where: { cancelledAt: null, resultNotifiedAt: null, closesAt: { lte: now } } });
  for (const p of ended) {
    const { count } = await prisma.poll.updateMany({ where: { id: p.id, resultNotifiedAt: null }, data: { resultNotifiedAt: now } });
    if (!count) continue;
    const ids = await pollVoterIds(p.audience);
    await queueForAll(prisma, ids, { kind: "poll", title: "Poll result", body: `${p.question} · see the result in the app`, url: p.audience === "ADMINS" ? "/admin/polls" : "/member/vote" });
    sent += ids.length;
  }
  return sent;
}
