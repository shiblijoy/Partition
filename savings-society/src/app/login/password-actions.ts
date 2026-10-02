"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

export type PasswordState = { error?: string; ok?: boolean };

/**
 * Changes the signed-in user's password. Other devices are signed out (their
 * sessions predate passwordChangedAt); this one gets a fresh session. Someone
 * on a temporary password is taken on to the app once they've set their own.
 */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await requireSession({ allowTemporaryPassword: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (!/\d/.test(next)) return { error: "New password must include a number." };
  if (next !== confirm) return { error: "New passwords don't match." };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    return { error: user.mustChangePassword ? "The temporary password is wrong." : "Current password is wrong." };
  }
  if (current === next) return { error: "Choose a password different from the current one." };

  // Second precision, matching the JWT's iat: the new session below stays valid.
  const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: changedAt },
  });
  await createSession({ userId: user.id, name: user.name, role: user.role });

  if (user.mustChangePassword) redirect(user.role === "ADMIN" ? "/admin" : "/member");
  return { ok: true };
}
