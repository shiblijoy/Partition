"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

export type AdminNavItem = { href: string; label: string; badge?: number };

/** Desktop console: a dark sidebar, which becomes a slide-down menu on phones. */
export function AdminShell({
  brand,
  items,
  userName,
  logoutAction,
  children,
}: {
  brand: string;
  items: AdminNavItem[];
  userName: string;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-sm no-underline ${
            isActive(item.href) ? "bg-side font-bold text-white" : "font-semibold text-[#D4DDD8] hover:bg-side/60"
          }`}
        >
          {item.label}
          {!!item.badge && <span className="rounded-full bg-[#F2B35C] px-2 py-0.5 text-xs font-extrabold text-ink">{item.badge}</span>}
        </Link>
      ))}
    </nav>
  );

  const logout = (
    <form action={logoutAction}>
      <button className="flex min-h-11 w-full items-center rounded-xl px-3 text-sm font-semibold text-[#D4DDD8] hover:bg-side/60">
        Log out
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="no-print hidden w-60 shrink-0 flex-col gap-7 bg-ink px-4 py-7 lg:flex">
        <div className="px-2">
          <div className="text-[17px] font-extrabold text-white">{brand}</div>
          <div className="text-xs text-[#A9B8B0]">Admin console · {userName}</div>
        </div>
        {nav}
        <div className="mt-auto">{logout}</div>
      </aside>

      <header className="no-print sticky top-0 z-20 bg-ink text-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-2">
          <div>
            <div className="text-base font-extrabold">{brand}</div>
            <div className="text-[11px] text-[#A9B8B0]">Admin console</div>
          </div>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-11 w-11 items-center justify-center rounded-xl"
          >
            <Icon name={open ? "close" : "menu"} size={22} />
          </button>
        </div>
        {open && (
          <div className="max-h-[80vh] overflow-y-auto border-t border-side px-3 pb-4 pt-2">
            {nav}
            {logout}
          </div>
        )}
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-[1360px]">{children}</div>
      </main>
    </div>
  );
}
