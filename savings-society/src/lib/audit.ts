import { prisma } from "@/lib/prisma";
import type { Db } from "@/lib/books";

type AuditExtra = { entity?: string; before?: unknown; after?: unknown; db?: Db };

/** Where the request came from, when there is one (server actions and routes). */
async function requestInfo(): Promise<{ ip: string | null; device: string | null }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ip, device: h.get("user-agent")?.slice(0, 200) ?? null };
  } catch {
    return { ip: null, device: null }; // not inside a request (scripts, scheduled jobs, tests)
  }
}

/**
 * Records an action in the audit log, with who, when, and before/after values
 * where they matter (FR-RPT-01). The log is append-only: nothing edits or deletes it.
 */
export async function audit(actorId: string | null, action: string, detail: string, extra: AuditExtra = {}): Promise<void> {
  const { ip, device } = await requestInfo();
  const db = extra.db ?? prisma;
  await db.auditLog.create({
    data: {
      actorId,
      action,
      detail,
      entity: extra.entity ?? null,
      before: extra.before === undefined ? null : JSON.stringify(extra.before),
      after: extra.after === undefined ? null : JSON.stringify(extra.after),
      ip,
      device,
    },
  });
}
