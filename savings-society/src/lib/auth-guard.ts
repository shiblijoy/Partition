import { redirect } from "next/navigation";
import { getSession, liveSession, type Role } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";

export type Viewer = { userId: string; name: string; role: Role; sid?: string; readOnly: boolean; language: string };

const LEAVER_ACCESS_DAYS = 365; // FR-MEM-07: a member who has left keeps read-only access for 12 months

/** Whether a user may still sign in, and whether only to look. */
export function accessFor(user: { active: boolean; exit: string | null; exitedAt: Date | null; role: string }): "full" | "read" | "none" {
  if (!user.active) return "none";
  if (user.role === "AUDITOR") return "read";
  if (user.exit) {
    const since = user.exitedAt ? Date.now() - user.exitedAt.getTime() : 0;
    return since <= LEAVER_ACCESS_DAYS * 86_400_000 ? "read" : "none";
  }
  return "full";
}

/**
 * Enforces login. The cookie alone isn't trusted: the session row must still be
 * live (not revoked by a password change, not expired) and the user still
 * allowed in. Someone on a temporary password is sent to set their own first.
 */
export async function requireSession(opts: { allowTemporaryPassword?: boolean } = {}): Promise<Viewer> {
  const session = await getSession();
  if (!session || !(await liveSession(session))) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, role: true, active: true, exit: true, exitedAt: true, mustChangePassword: true, language: true },
  });
  if (!user) redirect("/login");
  const access = accessFor(user);
  if (access === "none") redirect("/login");
  if (user.mustChangePassword && !opts.allowTemporaryPassword) redirect("/password");

  return { userId: user.id, name: user.name, role: user.role, sid: session.sid, readOnly: access === "read", language: user.language };
}

/** Admin console pages: admins, and auditors (read-only). */
export async function requireStaff(): Promise<Viewer> {
  const v = await requireSession();
  if (v.role === "MEMBER") redirect("/member");
  return v;
}

/** Anything that changes the society's records: admins only (NFR-SEC-04). */
export async function requireAdmin(): Promise<Viewer> {
  const v = await requireSession();
  if (v.role === "AUDITOR") throw new ServiceError("Auditors can view everything but can't change records.");
  if (v.role !== "ADMIN") redirect("/member");
  return v;
}

/** Member pages. A member who has left can still look (read-only). */
export async function requireMember(): Promise<Viewer> {
  const v = await requireSession();
  if (v.role !== "MEMBER") redirect("/admin");
  return v;
}

/** Member actions that change something: not for members who have left. */
export async function requireActiveMember(): Promise<Viewer> {
  const v = await requireMember();
  if (v.readOnly) throw new ServiceError("Your membership has ended, so your account is read-only.");
  return v;
}
