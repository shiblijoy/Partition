import { prisma } from "@/lib/prisma";
import type { Db } from "@/lib/books";

export type NoticeInput = {
  userId: string;
  kind: string; // payment_approved, payment_rejected, receipt, vote_opened, vote_closed, withdrawal, notice, document, reminder, security, …
  title: string;
  body: string;
  url?: string;
  whatsapp?: { template: string; params: string[] };
};

/**
 * Queues a notification: it appears in the member's in-app list at once and is
 * delivered by push (and WhatsApp, for the templates that use it) by deliver().
 * Written inside the caller's transaction, so it exists only if the change does.
 */
export async function queueNotification(db: Db, n: NoticeInput) {
  await db.notification.create({
    data: { userId: n.userId, kind: n.kind, title: n.title, body: n.body, url: n.url ?? null, whatsapp: n.whatsapp ? JSON.stringify(n.whatsapp) : null },
  });
}

export async function queueForAll(db: Db, userIds: string[], n: Omit<NoticeInput, "userId">) {
  if (userIds.length === 0) return;
  await db.notification.createMany({
    data: userIds.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body, url: n.url ?? null, whatsapp: n.whatsapp ? JSON.stringify(n.whatsapp) : null })),
  });
}

export async function adminIds(db: Db = prisma): Promise<string[]> {
  return (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })).map((u) => u.id);
}
