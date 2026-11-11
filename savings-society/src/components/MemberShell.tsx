"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { useT } from "@/components/I18n";
import { flushQueue, queuedPayments } from "@/lib/client/offline-queue";

const TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/member", label: "Home", icon: "home" },
  { href: "/member/pay", label: "Pay", icon: "upload" },
  { href: "/member/history", label: "History", icon: "list" },
  { href: "/member/vote", label: "Vote", icon: "vote" },
  { href: "/member/invest", label: "Invest", icon: "chart" },
];

/** Phone-first member app: a single column with a thumb-reachable tab bar. */
export function MemberShell({ children, readOnly }: { children: React.ReactNode; readOnly: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const [queued, setQueued] = useState(0);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const isActive = (href: string) => (href === "/member" ? pathname === href : pathname.startsWith(href));

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const send = async () => {
      try {
        const r = await flushQueue();
        setQueued((await queuedPayments()).length);
        if (r.sent) setSentNote(t("{n} saved payment(s) sent to the admin.", { n: r.sent }));
        if (r.failed.length) setSentNote(r.failed.join(" "));
      } catch {
        // IndexedDB unavailable (private mode): nothing queued
      }
    };
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <main className="mx-auto w-full max-w-lg px-5 pt-7">
        {readOnly && <p className="mb-4 rounded-xl bg-paper px-4 py-3 text-[13px] font-semibold text-muted ring-1 ring-line">{t("Your membership has ended. You can view your history and receipts for 12 months.")}</p>}
        {queued > 0 && <p className="mb-4 rounded-xl bg-warn-bg px-4 py-3 text-[13px] font-semibold text-warn">{t("{n} payment(s) saved on this phone, waiting for internet.", { n: queued })}</p>}
        {sentNote && <p className="mb-4 rounded-xl bg-good-bg px-4 py-3 text-[13px] font-semibold text-good">{sentNote}</p>}
        {children}
      </main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pb-3 pt-2">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center gap-1 p-1.5 text-[11px] no-underline ${active ? "font-bold text-brand" : "font-semibold text-muted"}`}
              >
                <Icon name={tab.icon} size={22} />
                {t(tab.label)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
