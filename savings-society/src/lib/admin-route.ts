import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** For route handlers: the signed-in, active admin, or null. */
export async function routeAdmin() {
  const session = await getSession();
  const user = session && (await prisma.user.findUnique({ where: { id: session.userId } }));
  return user && user.active && user.role === "ADMIN" ? user : null;
}
