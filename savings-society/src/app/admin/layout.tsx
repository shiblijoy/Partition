import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { logout } from "@/app/login/actions";
import { runDueJobsSoon } from "@/lib/jobs";
import { AdminShell, type AdminNavItem } from "@/components/AdminShell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireStaff();
  runDueJobsSoon();
  const [settings, pending, withdrawals, unread] = await Promise.all([
    getSettings(),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.notification.count({ where: { userId: viewer.userId, readAt: null } }),
  ]);

  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard", badge: unread },
    { href: "/admin/payments", label: "Approvals", badge: pending },
    { href: "/admin/members", label: "Members", badge: withdrawals },
    { href: "/admin/expenses", label: "Fund & expenses" },
    { href: "/admin/investments", label: "Investments" },
    { href: "/admin/documents", label: "Documents" },
    { href: "/admin/income", label: "Income & FDRs" },
    { href: "/admin/accounts", label: "Accounts & ledger" },
    { href: "/admin/close-month", label: "Close month" },
    { href: "/admin/notices", label: "Notices" },
    { href: "/admin/polls", label: "Polls" },
    { href: "/admin/report", label: "Reports" },
    { href: "/admin/settings", label: "Settings" },
  ];

  return (
    <AdminShell brand={settings.societyName} items={items} userName={`${viewer.name}${viewer.role === "AUDITOR" ? " · auditor" : ""}`} logoutAction={logout}>
      {viewer.role === "AUDITOR" && (
        <p className="mb-5 rounded-xl bg-paper px-4 py-3 text-[13px] font-semibold text-muted ring-1 ring-line">
          Auditor view: you can see every record and the audit log, but nothing can be changed from this account.
        </p>
      )}
      {children}
    </AdminShell>
  );
}
