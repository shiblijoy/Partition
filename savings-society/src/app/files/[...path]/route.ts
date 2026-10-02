import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";

/**
 * Serves uploaded payment proofs and expense receipts.
 * - proofs/<memberId>/…: the admin, or the member who uploaded it.
 * - receipts/…: any signed-in user (members can see what the fund was spent on).
 */
export async function GET(_req: Request, ctx: RouteContext<"/files/[...path]">) {
  const { path } = await ctx.params;
  const relPath = path.join("/");

  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, active: true } });
  if (!user?.active) return new Response("Unauthorized", { status: 401 });

  const [folder, owner] = path;
  const allowed =
    user.role === "ADMIN" ||
    (folder === "proofs" && owner === session.userId) ||
    folder === "receipts";
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const file = await readStoredFile(relPath);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
