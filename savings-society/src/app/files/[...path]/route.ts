import { getSession, liveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { accessFor } from "@/lib/auth-guard";
import { readStoredFile } from "@/lib/uploads";

/**
 * Serves uploaded files after a session check (§6.4: proofs and documents are private).
 * - proofs/<memberId>/…: the admin/auditor, or the member who uploaded it.
 * - receipts/… (expense receipts) and notices/…: any signed-in user (open books, notice attachments).
 * - documents/…: staff only here; members open documents through /docs/<id> (seen-by and watermark).
 * - anything else (statements, certificates, receipt PDFs): staff only.
 */
export async function GET(_req: Request, ctx: RouteContext<"/files/[...path]">) {
  const { path } = await ctx.params;
  const session = await getSession();
  if (!session || !(await liveSession(session))) return new Response("Unauthorized", { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, active: true, exit: true, exitedAt: true } });
  if (!user || accessFor(user) === "none") return new Response("Unauthorized", { status: 401 });

  const [folder, owner] = path;
  const staff = user.role === "ADMIN" || user.role === "AUDITOR";
  const allowed = staff || (folder === "proofs" && owner === session.userId) || folder === "receipts" || folder === "notices";
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const file = await readStoredFile(path.join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=900", "X-Content-Type-Options": "nosniff" },
  });
}
