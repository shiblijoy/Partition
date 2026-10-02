import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { logout } from "@/app/login/actions";
import { Icon } from "@/components/icons";
import { Notice, secondaryButton } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

/** Account & password. Also where anyone on a temporary password is sent to set their own. */
export default async function PasswordPage() {
  const session = await requireSession({ allowTemporaryPassword: true });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const first = user.mustChangePassword;
  const back = user.role === "ADMIN" ? "/admin/settings" : "/member/profile";

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6">
      <div className="-ml-3 mb-4 flex items-center gap-1">
        {!first && (
          <Link href={back} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-ink">
            <Icon name="back" size={22} />
          </Link>
        )}
        <h1 className={`text-xl font-bold ${first ? "ml-3" : ""}`}>{first ? "Set your password" : "Account & password"}</h1>
      </div>

      <div className="flex flex-col gap-5">
        {first && <Notice tone="warn">You logged in with a temporary password from the admin. Set your own password to continue.</Notice>}

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="min-w-0">
            <p className="font-bold">
              {user.name}
              {user.memberNo != null && ` · #${String(user.memberNo).padStart(2, "0")}`}
            </p>
            <p className="text-[13px] text-muted">{user.phone}</p>
          </div>
          <p className="text-right text-xs leading-snug text-muted">Name and number<br />changed by admin</p>
        </div>

        <ChangePasswordForm temporary={first} />

        <form action={logout}>
          <button className={`w-full ${secondaryButton}`}>Log out</button>
        </form>
      </div>
    </div>
  );
}
