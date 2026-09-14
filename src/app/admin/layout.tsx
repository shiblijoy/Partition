import Link from "next/link";
import { requireSession } from "@/lib/auth-guard";
import { logout } from "@/app/login/actions";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/animals", label: "Animals" },
  { href: "/admin/costs", label: "Log Costs" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-emerald-700">🐄 Farm Manager</span>
            <nav className="hidden gap-4 sm:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-stone-600 hover:text-emerald-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">{session.name}</span>
            <form action={logout}>
              <button className="text-sm font-medium text-stone-500 hover:text-red-600">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto border-t border-stone-100 px-4 py-2 sm:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-sm font-medium text-stone-600 hover:text-emerald-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
