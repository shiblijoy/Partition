import { runDueJobs } from "@/lib/jobs";

/**
 * Called every 15 minutes by deploy/dreamhive-jobs.timer:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
  return Response.json({ ok: true, ran: await runDueJobs() });
}
