import { prisma } from "@/lib/prisma";
import { getSession, liveSession } from "@/lib/session";
import { readStoredFile } from "@/lib/uploads";
import { getSettings } from "@/lib/settings";
import { watermark } from "@/lib/watermark";
import { fmtDate } from "@/lib/format";

/**
 * Opens an asset document. Records that this person has seen it (FR-DOC-07),
 * hides admin-only documents from members (FR-DOC-05), and stamps a member's
 * copy with the society's name, their name and the date (FR-DOC-08).
 */
export async function GET(_req: Request, ctx: RouteContext<"/docs/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session || !(await liveSession(session))) return new Response("Unauthorized", { status: 401 });
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  const staff = session.role !== "MEMBER";
  if (!staff && (doc.adminOnly || doc.replacedById)) return new Response("Not found", { status: 404 });

  await prisma.documentView.upsert({ where: { documentId_userId: { documentId: id, userId: session.userId } }, create: { documentId: id, userId: session.userId }, update: {} });
  const file = await readStoredFile(doc.filePath);
  if (!file) return new Response("Not found", { status: 404 });
  const filename = doc.title.replace(/[^\w.-]+/g, "-");

  if (staff || file.contentType === "image/webp") {
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  }
  const settings = await getSettings();
  const stamped = await watermark(file.bytes, file.contentType, `${settings.societyName} · ${session.name} · ${fmtDate(new Date())}`);
  return new Response(new Uint8Array(stamped), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" } });
}
