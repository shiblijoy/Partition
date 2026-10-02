"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

/**
 * Responsive shell: a top bar with inline links on desktop, and a fixed bottom
 * tab bar on phones (thumb-reachable, like a native app).
 */
export function AppShell({
  brand,
  tag,
  items,
  userName,
  logoutAction,
  children,
}: {
  brand: string;
  tag?: string;
  items: NavItem[];
  userName: string;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href.split("/").length > 2 && pathname.startsWith(href + "/"));

  return (
    <div className="min-h-screen bg-slate-50 pb-20 sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-6">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-lg font-semibold text-teal-700">💰 {brand}</span>
              {tag && <span className="shrink-0 rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">{tag}</span>}
            </span>
            <nav className="hidden gap-1 sm:flex">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative rounded-md px-3 py-1.5 text-sm font-medium ${
                    isActive(item.href) ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:text-teal-700"
                  }`}
                >
                  {item.label}
                  {!!item.badge && (
                    <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{userName}</span>
            <form action={logoutAction}>
              <button className="text-sm font-medium text-slate-500 hover:text-red-600">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isActive(item.href) ? "text-teal-700" : "text-slate-500"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
            {!!item.badge && (
              <span className="absolute right-1/4 top-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
