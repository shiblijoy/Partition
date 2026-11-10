import { getSession, liveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { accessFor } from "@/lib/auth-guard";
import { changed } from "@/lib/actions";
import { handleSubmission } from "@/app/member/pay/submit";

/** Upload endpoint for payments that were queued on the phone while offline (NFR-REL-04). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "MEMBER" || !(await liveSession(session))) return Response.json({ error: "Log in again to send your saved payment." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || accessFor(user) !== "full") return Response.json({ error: "Your account can't submit payments." }, { status: 403 });
  const result = await handleSubmission(user.id, await req.formData());
  if (!result.ok) return Response.json({ error: result.error ?? result.warning }, { status: 422 });
  changed();
  return Response.json({ ok: true });
}
