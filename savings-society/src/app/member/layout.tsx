import { requireMember } from "@/lib/auth-guard";
import { MemberShell } from "@/components/MemberShell";

export default async function MemberLayout({ children }: LayoutProps<"/member">) {
  await requireMember();
  return <MemberShell>{children}</MemberShell>;
}
