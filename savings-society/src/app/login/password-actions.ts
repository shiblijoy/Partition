"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { hashPassword, verifyPassword } from "@/lib/password";

export type PasswordState = { error?: string; ok?: boolean };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "New passwords don't match." };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Current password is wrong." };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true };
}
