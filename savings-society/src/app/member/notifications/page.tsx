import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { tFor, dateName } from "@/lib/i18n";
import { ScreenHeader } from "@/components/ui";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push";

/** FR-NTF-04: the member's notifications inside the app. Opening the page marks them read. */
export default async function NotificationsPage() {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const [items, unreadNotices] = await Promise.all([
    prisma.notification.findMany({ where: { userId: viewer.userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.notice.count({ where: { reads: { none: { userId: viewer.userId } } } }),
  ]);
  await prisma.notification.updateMany({ where: { userId: viewer.userId, readAt: null }, data: { readAt: new Date() } });

  return (
    <div className="flex flex-col gap-3">
      <ScreenHeader title={t("Notifications")} back="/member" />
      <PushToggle publicKey={vapidPublicKey()} />
      <Link href="/member/notices" className="flex min-h-12 items-center justify-between rounded-2xl border border-line bg-white px-4 text-sm font-bold text-ink no-underline">
        {t("Notice board")}
        {unreadNotices > 0 && <span className="rounded-full bg-[#D9822B] px-2 py-0.5 text-xs text-white">{unreadNotices}</span>}
      </Link>
      {items.length === 0 && <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">{t("No notifications yet.")}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id}>
            <Link href={n.url ?? "/member"} className={`flex flex-col gap-0.5 rounded-xl border bg-white px-4 py-3 text-ink no-underline ${n.readAt ? "border-line" : "border-brand"}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{t(n.title)}</span>
                <span className="text-xs text-muted">{dateName(n.createdAt, viewer.language, false)}</span>
              </span>
              <span className="text-[13px] leading-relaxed text-muted">{n.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
