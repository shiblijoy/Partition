"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { EDITABLE_FIELDS, FIELD_LABELS, validateField, type DetailChanges } from "@/lib/profile-fields";
import type { FormState } from "@/components/ActionForm";

function revalidateAll() {
  revalidatePath("/member", "layout");
  revalidatePath("/admin", "layout");
}

/**
 * The member edits their own details. Nothing changes yet: the edits wait as a
 * request until the admin approves them. A new edit replaces one still waiting.
 */
export async function proposeDetailsChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireMember();
  const member = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  const changes: DetailChanges = {};
  for (const [field] of EDITABLE_FIELDS) {
    const to = String(formData.get(field) ?? "").trim() || null;
    const from = member[field] ?? null;
    if (to === from) continue; // untouched fields aren't checked: old values may predate these rules
    const error = validateField(field, to);
    if (error) return { error };
    changes[field] = { from, to };
  }
  const fields = Object.keys(changes) as Array<keyof typeof FIELD_LABELS>;
  if (fields.length === 0) return { error: "Nothing has changed." };

  // A newer edit replaces one still waiting, so the admin only sees the latest.
  await prisma.memberRequest.deleteMany({ where: { memberId: session.userId, status: "OPEN", changes: { not: null } } });
  await prisma.memberRequest.create({
    data: {
      memberId: session.userId,
      message: `Update ${fields.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")}`,
      changes: JSON.stringify(changes),
    },
  });
  revalidateAll();
  return { ok: "Sent to the admin. Your details change once they approve." };
}

export async function cancelDetailsChange(requestId: string): Promise<void> {
  const session = await requireMember();
  await prisma.memberRequest.deleteMany({ where: { id: requestId, memberId: session.userId, status: "OPEN" } });
  revalidateAll();
}

/** Name and mobile number are changed by the admin only; members ask in free text. */
export async function requestDetailsChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireMember();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Say what should change." };
  await prisma.memberRequest.create({ data: { memberId: session.userId, message } });
  revalidateAll();
  return { ok: "Sent. The admin will update your details." };
}

/** Deleting an account means leaving the society: it's a full withdrawal that also erases personal details once paid. */
export async function requestAccountDeletion(): Promise<void> {
  const session = await requireMember();
  const open = await prisma.withdrawal.findFirst({ where: { memberId: session.userId, status: { in: ["PENDING", "APPROVED"] } } });
  const member = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (open) {
    await prisma.withdrawal.update({ where: { id: open.id }, data: { eraseData: true } });
  } else {
    await prisma.withdrawal.create({
      data: { memberId: session.userId, kind: "FULL", payTo: `bKash ${member.phone}`, reason: "Asked to delete their account", eraseData: true },
    });
  }
  revalidateAll();
}
