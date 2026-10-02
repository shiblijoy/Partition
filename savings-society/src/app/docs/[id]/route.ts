import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { fileUrl } from "@/lib/uploads";

/** Opens an asset document, recording that this person has seen it ("seen by 18 / 24"). */
export async function GET(req: Request, ctx: RouteContext<"/docs/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });

  await prisma.documentView.upsert({
    where: { documentId_userId: { documentId: id, userId: session.userId } },
    create: { documentId: id, userId: session.userId },
    update: {},
  });
  return Response.redirect(new URL(fileUrl(doc.filePath), req.url), 303);
}
