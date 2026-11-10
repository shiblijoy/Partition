"use server";

import { InvestmentKind, VoteRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { attempt, changed, dateField, text } from "@/lib/actions";
import * as svc from "@/lib/services/investments";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

const actorOf = (v: { userId: string; name: string }) => ({ id: v.userId, name: v.name });

export async function proposeInvestment(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const kind = String(formData.get("kind") ?? "") as InvestmentKind;
    const voteRule = String(formData.get("voteRule") ?? "") as VoteRule;
    const endsRaw = String(formData.get("voteEndsAt") ?? "");
    if (!Object.values(InvestmentKind).includes(kind)) return { error: "Choose land, business or shares." };
    if (!Object.values(VoteRule).includes(voteRule)) return { error: "Choose how members must approve." };
    if (!endsRaw) return { error: "Choose when voting ends." };
    const inv = await svc.proposeInvestment(await getSettings(), {
      kind,
      name: text(formData, "name") ?? "",
      plan: text(formData, "plan"),
      details: text(formData, "details"),
      amount: Number(formData.get("amount")),
      voteRule,
      voteEndsAt: new Date(`${endsRaw}T23:59:59`),
      actor: actorOf(admin),
    });
    // FR-DOC-09: the proposal's documents are visible to members during the vote.
    const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
    try {
      for (const file of files) {
        const filePath = await saveFile("documents", file, 20 * 1024 * 1024);
        await prisma.document.create({ data: { assetType: kind, investmentId: inv.id, docType: "Proposal document", title: file.name.replace(/\.[^.]+$/, ""), filePath } });
      }
    } catch (err) {
      if (err instanceof UploadError) return { error: `Proposal saved, but a document failed: ${err.message}` };
      throw err;
    }
    changed();
    return { ok: "Sent to members for a vote. They've been notified." };
  });
}

export async function finishVote(id: string): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const t = await svc.closeVote(await getSettings(), id, actorOf(admin));
    changed();
    return { ok: t ? (t.passed ? "Passed. Now record the money paid out." : "Closed: not approved.") : "Already closed." };
  });
}

export async function startInvestment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const r = await svc.startInvestment(await getSettings(), id, { accountId: text(formData, "accountId"), date: dateField(formData, "date"), actor: actorOf(admin) });
    changed();
    return { ok: r === "waiting" ? "Recorded your approval. Above the society's limit, a second admin must confirm." : "Invested. It's now an active investment." };
  });
}

export async function withdrawProposal(id: string): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await svc.withdrawProposal(id, actorOf(admin));
    changed();
    return { ok: "Withdrawn." };
  });
}

export async function updateValuation(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await svc.recordValuation(id, Number(formData.get("value")), actorOf(admin));
    changed();
    return { ok: "Valuation recorded (an estimate: not profit until sold)." };
  });
}

export async function recordProfit(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await svc.recordProfit(await getSettings(), id, { amount: Number(formData.get("amount")), date: dateField(formData, "date"), accountId: text(formData, "accountId"), actor: actorOf(admin) });
    changed();
    return { ok: "Profit recorded and shared with members." };
  });
}

export async function closeInvestment(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await svc.closeInvestment(await getSettings(), id, { returned: Number(formData.get("returned")), date: dateField(formData, "date"), accountId: text(formData, "accountId"), actor: actorOf(admin) });
    changed();
    return { ok: "Closed. The money is back in the fund and the gain is shared." };
  });
}
