import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Enforces login. The JWT alone isn't trusted for access: we re-check the user
 * row so a deactivated member (or a demoted admin) loses access immediately.
 * Someone still on a temporary password is sent to set their own first.
 */
export async function requireSession(opts: { allowTemporaryPassword?: boolean } = {}): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, role: true, active: true, mustChangePassword: true, passwordChangedAt: true },
  });
  if (!user || !user.active) redirect("/login");
  if (user.passwordChangedAt && (session.issuedAt ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    redirect("/login"); // password changed on another device
  }
  if (user.mustChangePassword && !opts.allowTemporaryPassword) redirect("/password");

  return { userId: user.id, name: user.name, role: user.role };
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/member");
  return session;
}

export async function requireMember(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "MEMBER") redirect("/admin");
  return session;
}
