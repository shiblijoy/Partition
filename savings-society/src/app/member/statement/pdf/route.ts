import { getSession, liveSession } from "@/lib/session";
import { statementPdf } from "@/lib/statement";

/** The member's own yearly statement as PDF (staff may pass ?member=). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !(await liveSession(session))) return new Response("Unauthorized", { status: 401 });
  const params = new URL(req.url).searchParams;
  const year = Number(params.get("year")) || new Date().getFullYear();
  const memberId = session.role === "MEMBER" ? session.userId : params.get("member");
  if (!memberId) return new Response("Choose a member", { status: 400 });
  const bytes = await statementPdf(memberId, year);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="statement-${year}.pdf"` } });
}
