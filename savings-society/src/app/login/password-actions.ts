"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { hashPassword, verifyPassword } from "@/lib/password";
import { revokeSessions } from "@/lib/session";
import { audit } from "@/lib/audit";

export type PasswordState = { error?: string; ok?: boolean };

/**
 * Changes the signed-in user's password (FR-AUTH-04/05). Every other device is
 * signed out (FR-AUTH-06); this one stays. Someone on a temporary password is
 * taken on to the app once they've set their own (FR-AUTH-03).
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

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date() } });
  await revokeSessions(user.id, session.sid);
  await audit(user.id, "password.changed", `${user.name} ${user.mustChangePassword ? "set their own password" : "changed their password"}; other devices signed out`);

  if (user.mustChangePassword) redirect(user.role === "MEMBER" ? "/member" : "/admin");
  return { ok: true };
}
