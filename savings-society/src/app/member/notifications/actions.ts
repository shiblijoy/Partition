"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const viewer = await requireSession();
  if (!sub?.endpoint?.startsWith("https://")) return;
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: viewer.userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId: viewer.userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}
