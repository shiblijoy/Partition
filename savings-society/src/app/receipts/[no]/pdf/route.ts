import { prisma } from "@/lib/prisma";
import { getSession, liveSession } from "@/lib/session";
import { receiptPdf } from "@/lib/receipt-pdf";

/** FR-RCP-04: download a receipt as PDF — the member it belongs to, or the admin / auditor. */
export async function GET(_req: Request, ctx: RouteContext<"/receipts/[no]/pdf">) {
  const { no } = await ctx.params;
  const session = await getSession();
  if (!session || !(await liveSession(session))) return new Response("Unauthorized", { status: 401 });
  const receipt = await prisma.receipt.findUnique({ where: { receiptNo: no } });
  if (!receipt) return new Response("Not found", { status: 404 });
  if (session.role === "MEMBER" && receipt.memberId !== session.userId) return new Response("Forbidden", { status: 403 });
  const bytes = await receiptPdf(receipt.id, session.role !== "MEMBER");
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${receipt.receiptNo}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
