import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { monthLabel } from "@/lib/months";
import { Card, PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function AccountPage() {
  const session = await requireMember();
  const member = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="My account" />
      <Card title="Profile">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd>{member.name}</dd>
          <dt className="text-slate-500">Phone</dt>
          <dd>{member.phone}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd>{member.email ?? "—"}</dd>
          <dt className="text-slate-500">Member since</dt>
          <dd>{monthLabel(member.joinMonth, "long")}</dd>
        </dl>
        <p className="mt-3 text-xs text-slate-400">To change these details, ask the admin.</p>
      </Card>
      <Card title="Change password">
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
