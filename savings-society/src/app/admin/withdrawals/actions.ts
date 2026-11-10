"use server";

import { redirect } from "next/navigation";
import type { LandShareTiming } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { attempt, changed, dateField, text } from "@/lib/actions";
import { audit } from "@/lib/audit";
import * as svc from "@/lib/services/withdrawals";
import type { FormState } from "@/components/ActionForm";

const actorOf = (v: { userId: string; name: string }) => ({ id: v.userId, name: v.name });

export async function approveWithdrawal(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const landTiming: LandShareTiming = formData.get("landTiming") === "NOW" ? "NOW" : "ON_SALE";
    const r = await svc.approveWithdrawal(await getSettings(), id, { landTiming, actor: actorOf(admin) });
    changed();
    return { ok: r === "waiting" ? "Your approval is recorded. Above the society's limit, a second admin must also approve." : "Approved. Send the money, then record the payout." };
  });
}

export async function declineWithdrawal(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await svc.declineWithdrawal(id, text(formData, "note") ?? "", actorOf(admin));
    changed();
    return { ok: "Declined." };
  });
}

export async function reopenWithdrawal(id: string): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await svc.reopenWithdrawal(id, actorOf(admin));
    changed();
    return { ok: "Back to pending." };
  });
}

export async function recordPayout(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await svc.recordPayout(await getSettings(), id, { reference: text(formData, "reference") ?? "", paidAt: dateField(formData, "paidOn"), accountId: text(formData, "accountId"), actor: actorOf(admin) });
    changed();
    return { ok: "Payout recorded and receipt issued." };
  });
}

/** For a nominee settlement (UC-11: the nominee's confirmation is recorded by the admin). */
export async function confirmForNominee(id: string): Promise<void> {
  const admin = await requireAdmin();
  const w = await prisma.withdrawal.update({ where: { id, status: "PAID", kind: "NOMINEE" }, data: { memberConfirmedAt: new Date() }, include: { member: true } });
  await audit(admin.userId, "payout.confirmed", `${admin.name} confirmed the nominee of ${w.member.name} received the settlement`, { entity: `withdrawal:${id}` });
  changed();
}

/** FR-WD-08: once the land is sold, pay the land share that was left owed. */
export async function payOwedLandShare(parentId: string): Promise<FormState> {
  const r = await attempt(async () => {
    const admin = await requireAdmin();
    const w = await svc.startLandSharePayout(parentId, actorOf(admin));
    changed();
    return { ok: w.id };
  });
  if (r.ok) redirect(`/admin/withdrawals/${r.ok}`);
  return r;
}
