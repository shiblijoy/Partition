import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Web push to the installed app (Android Chrome and iPhone home-screen apps).
 * Needs VAPID keys: `npx web-push generate-vapid-keys`, then set
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:you@example.com).
 */
let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured === null) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    configured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    if (configured) webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  }
  return configured;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/** Sends to every phone the user subscribed. Gone subscriptions are removed. Returns how many got it. */
export async function pushToUser(userId: string, payload: { title: string; body: string; url?: string | null; kind?: string }): Promise<number> {
  if (!pushConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      sent++;
      await prisma.messageLog.create({ data: { userId, to: "push", channel: "PUSH", template: payload.title, status: "SENT" } });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      await prisma.messageLog.create({ data: { userId, to: "push", channel: "PUSH", template: payload.title, status: "FAILED", error: String(status ?? err) } });
    }
  }
  return sent;
}
