import { requireMember } from "@/lib/auth-guard";
import { MemberShell } from "@/components/MemberShell";
import { I18nProvider } from "@/components/I18n";
import { runDueJobsSoon } from "@/lib/jobs";

export default async function MemberLayout({ children }: LayoutProps<"/member">) {
  const viewer = await requireMember();
  runDueJobsSoon();
  return (
    <I18nProvider lang={viewer.language}>
      <MemberShell readOnly={viewer.readOnly}>{children}</MemberShell>
    </I18nProvider>
  );
}
