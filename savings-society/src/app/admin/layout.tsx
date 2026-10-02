import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { logout } from "@/app/login/actions";
import { AdminShell, type AdminNavItem } from "@/components/AdminShell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  const [settings, pending, withdrawals] = await Promise.all([
    getSettings(),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
  ]);

  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/payments", label: "Approvals", badge: pending },
    { href: "/admin/members", label: "Members", badge: withdrawals },
    { href: "/admin/expenses", label: "Fund & expenses" },
    { href: "/admin/investments", label: "Investments" },
    { href: "/admin/documents", label: "Documents" },
    { href: "/admin/income", label: "Income & FDRs" },
    { href: "/admin/close-month", label: "Close month" },
    { href: "/admin/notices", label: "Notices" },
    { href: "/admin/report", label: "Reports" },
    { href: "/admin/settings", label: "Settings" },
  ];

  return (
    <AdminShell brand={settings.societyName} items={items} userName={session.name} logoutAction={logout}>
      {children}
    </AdminShell>
  );
}
