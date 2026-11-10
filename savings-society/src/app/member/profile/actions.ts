"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireActiveMember, requireSession } from "@/lib/auth-guard";
import { attempt, changed, text } from "@/lib/actions";
import { pii } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { adminIds, queueForAll } from "@/lib/notify";
import { EDITABLE_FIELDS, FIELD_LABELS, serializeChanges, validateField, type DetailChanges } from "@/lib/profile-fields";
import type { FormState } from "@/components/ActionForm";

/**
 * FR-MEM-08: the member edits their own details. Nothing changes yet: the edits
 * wait as a request until the admin approves them. A new edit replaces one still waiting.
 */
export async function proposeDetailsChange(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const viewer = await requireActiveMember();
    const member = pii(await prisma.user.findUniqueOrThrow({ where: { id: viewer.userId } }));
    const changes: DetailChanges = {};
    for (const [field] of EDITABLE_FIELDS) {
      const to = text(formData, field);
      const from = member[field] ?? null;
      if (to === from) continue; // untouched fields aren't checked: old values may predate these rules
      const error = validateField(field, to);
      if (error) return { error };
      changes[field] = { from, to };
    }
    const fields = Object.keys(changes) as Array<keyof typeof FIELD_LABELS>;
    if (fields.length === 0) return { error: "Nothing has changed." };
    await prisma.memberRequest.deleteMany({ where: { memberId: viewer.userId, status: "OPEN", changes: { not: null } } });
    await prisma.memberRequest.create({ data: { memberId: viewer.userId, message: `Update ${fields.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")}`, changes: serializeChanges(changes) } });
    await queueForAll(prisma, await adminIds(), { kind: "details_change", title: "Details change to approve", body: `${viewer.name} edited their details.`, url: `/admin/members/${viewer.userId}` });
    changed();
    return { ok: "Sent to the admin. Your details change once they approve." };
  });
}

export async function cancelDetailsChange(requestId: string): Promise<void> {
  const viewer = await requireActiveMember();
  await prisma.memberRequest.deleteMany({ where: { id: requestId, memberId: viewer.userId, status: "OPEN" } });
  changed();
}

/** FR-AUTH-11: name and mobile number are changed by the admin only; members ask in free text. */
export async function requestDetailsChange(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const viewer = await requireActiveMember();
    const message = text(formData, "message");
    if (!message) return { error: "Say what should change." };
    await prisma.memberRequest.create({ data: { memberId: viewer.userId, message } });
    changed();
    return { ok: "Sent. The admin will update your details." };
  });
}

/** FR-MEM-11: deleting an account means leaving the society — a full withdrawal that erases personal details once paid. */
export async function requestAccountDeletion(): Promise<void> {
  const viewer = await requireActiveMember();
  const open = await prisma.withdrawal.findFirst({ where: { memberId: viewer.userId, status: { in: ["PENDING", "APPROVED"] } } });
  const member = await prisma.user.findUniqueOrThrow({ where: { id: viewer.userId } });
  if (open) await prisma.withdrawal.update({ where: { id: open.id }, data: { eraseData: true } });
  else await prisma.withdrawal.create({ data: { memberId: viewer.userId, kind: "FULL", payTo: `bKash ${member.phone}`, reason: "Asked to delete their account", eraseData: true } });
  await queueForAll(prisma, await adminIds(), { kind: "withdrawal_request", title: "Account deletion request", body: `${viewer.name} asked to delete their account (a full exit).`, url: "/admin/members" });
  await audit(viewer.userId, "member.deletion_requested", `${viewer.name} asked to delete their account`);
  changed();
}

/** NFR-USE-02: the member picks Bangla or English. */
export async function setLanguage(lang: "en" | "bn"): Promise<void> {
  const viewer = await requireSession();
  await prisma.user.update({ where: { id: viewer.userId }, data: { language: lang } });
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  changed();
}
