"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

const TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/member", label: "Home", icon: "home" },
  { href: "/member/pay", label: "Pay", icon: "upload" },
  { href: "/member/history", label: "History", icon: "list" },
  { href: "/member/invest", label: "Invest", icon: "chart" },
];

/** Phone-first member app: a single column with a thumb-reachable tab bar. */
export function MemberShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/member" ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-screen pb-24">
      <main className="mx-auto w-full max-w-lg px-5 pt-7">{children}</main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pb-3 pt-2">
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
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
