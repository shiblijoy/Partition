import { prisma } from "@/lib/prisma";
import { getSession, liveSession } from "@/lib/session";

/** For route handlers: the signed-in admin or auditor (read access), or null. */
export async function routeStaff() {
  const session = await getSession();
  if (!session || !(await liveSession(session))) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user && user.active && (user.role === "ADMIN" || user.role === "AUDITOR") ? user : null;
}

/** For route handlers that change something: admins only. */
export async function routeAdmin() {
  const user = await routeStaff();
  return user?.role === "ADMIN" ? user : null;
}
