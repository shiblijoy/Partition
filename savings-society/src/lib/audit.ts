import { prisma } from "@/lib/prisma";

/** Records an admin action in the audit log. The log is append-only: nothing edits or deletes it. */
export async function audit(actorId: string | null, action: string, detail: string): Promise<void> {
  await prisma.auditLog.create({ data: { actorId, action, detail } });
}
