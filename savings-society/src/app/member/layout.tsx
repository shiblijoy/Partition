import { requireMember } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { logout } from "@/app/login/actions";
import { AppShell, type NavItem } from "@/components/AppShell";

export default async function MemberLayout({ children }: LayoutProps<"/member">) {
  const [session, settings] = await Promise.all([requireMember(), getSettings()]);

  const items: NavItem[] = [
    { href: "/member", label: "Home", icon: "🏠" },
    { href: "/member/pay", label: "Pay", icon: "➕" },
    { href: "/member/history", label: "History", icon: "🧾" },
    { href: "/member/fund", label: "Fund", icon: "📊" },
    { href: "/member/account", label: "Account", icon: "👤" },
  ];

  return (
    <AppShell brand={settings.societyName} items={items} userName={session.name} logoutAction={logout}>
      {children}
    </AppShell>
  );
}
