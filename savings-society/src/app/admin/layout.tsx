import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { logout } from "@/app/login/actions";
import { AppShell, type NavItem } from "@/components/AppShell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  const [settings, pending] = await Promise.all([
    getSettings(),
    prisma.payment.count({ where: { status: "PENDING" } }),
  ]);

  const items: NavItem[] = [
    { href: "/admin", label: "Home", icon: "🏠" },
    { href: "/admin/payments", label: "Approvals", icon: "✅", badge: pending },
    { href: "/admin/members", label: "Members", icon: "👥" },
    { href: "/admin/expenses", label: "Costs", icon: "💸" },
    { href: "/admin/report", label: "Report", icon: "📊" },
    { href: "/admin/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <AppShell brand={settings.societyName} tag="Admin" items={items} userName={session.name} logoutAction={logout}>
      {children}
    </AppShell>
  );
}
