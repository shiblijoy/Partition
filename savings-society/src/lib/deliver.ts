import { prisma } from "@/lib/prisma";
import { pushToUser } from "@/lib/push";
import { sendTemplate, type Template } from "@/lib/messaging";

/**
 * Delivers queued notifications: push to the member's phones and, for the
 * templates that use it, a WhatsApp message. §6.3: a push carries no amounts or
 * personal data beyond the first name; the details load inside the app.
 * Safe to call from anywhere and more than once: each row is claimed first.
 */
export async function deliver(limit = 200): Promise<number> {
  const queued = await prisma.notification.findMany({ where: { pushedAt: null }, orderBy: { createdAt: "asc" }, take: limit, include: { user: { select: { name: true, phone: true, contactPhone: true, role: true } } } });
  let done = 0;
  for (const n of queued) {
    const { count } = await prisma.notification.updateMany({ where: { id: n.id, pushedAt: null }, data: { pushedAt: new Date() } });
    if (!count) continue; // someone else is delivering it
    const first = n.user.name.split(/\s+/)[0];
    try {
      // Notices show their title; reminders say what's due without the amount; the rest stay generic.
      const body =
        n.kind === "notice" ? n.body : n.kind === "reminder" ? `Hi ${first}, your monthly deposit is due. Tap to pay and upload the proof.` : `Hi ${first}, open Dreamhive for the details.`;
      await pushToUser(n.userId, { title: n.title, body, url: n.url, kind: n.kind });
      if (n.whatsapp) {
        const { template, params } = JSON.parse(n.whatsapp) as { template: Template; params: string[] };
        const phone = n.user.role === "MEMBER" ? n.user.phone : n.user.contactPhone;
        if (phone) await sendTemplate(phone, template, params, n.userId);
      }
    } catch (err) {
      console.error("Notification delivery failed", n.id, err);
    }
    done++;
  }
  return done;
}
