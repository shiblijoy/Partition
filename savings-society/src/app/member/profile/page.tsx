import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { fundSummary, memberPosition } from "@/lib/society";
import { monthLabel } from "@/lib/months";
import { mask } from "@/lib/format";
import { logout } from "@/app/login/actions";
import { cancelWithdrawal } from "@/app/member/withdraw/actions";
import { Icon } from "@/components/icons";
import { ActionForm } from "@/components/ActionForm";
import { Field, Notice, ScreenHeader, inputClass, secondaryButton } from "@/components/ui";
import { requestAccountDeletion, requestDetailsChange } from "./actions";

export default async function ProfilePage() {
  const session = await requireMember();
  const [settings, member, fund, deletion] = await Promise.all([
    getSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    fundSummary(),
    prisma.withdrawal.findFirst({ where: { memberId: session.userId, eraseData: true, status: { in: ["PENDING", "APPROVED"] } } }),
  ]);
  const position = await memberPosition(member.id, fund);
  const $ = (n: number) => money(n, settings.currencySymbol);
  const initials = member.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  const links: Array<[string, string]> = [
    ["/password", "Change password"],
    ["/member/notices", "Notices"],
    ["/member/documents", "Asset documents"],
    ["/member/fund", "Society books"],
    ["/verify", "Check a receipt"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="My profile" back="/member" />

      <div className="flex items-center gap-3.5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">{initials}</span>
        <div>
          <div className="text-lg font-extrabold">{member.name}</div>
          <div className="text-[13px] text-muted">
            {member.memberNo != null && `Member #${String(member.memberNo).padStart(2, "0")} · `}since {monthLabel(member.joinMonth)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 rounded-2xl border border-line bg-white p-4 text-sm">
        <Field label="Mobile">{member.phone}</Field>
        <Field label="NID">{mask(member.nid)}</Field>
        <Field label="Date of birth">{member.dateOfBirth ?? "—"}</Field>
        <Field label="Address">{member.address ?? "—"}</Field>
      </div>

      <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-4 text-sm">
        <div className="text-xs font-extrabold tracking-wide text-muted">NOMINEE</div>
        {member.nomineeName ? (
          <>
            <div className="font-bold">{member.nomineeName}{member.nomineeRelation && ` · ${member.nomineeRelation}`}</div>
            <div className="text-[13px] text-muted">{member.nomineePhone ?? "—"} · NID {mask(member.nomineeNid)}</div>
          </>
        ) : (
          <div className="font-bold text-warn">No nominee yet — ask the admin to add one.</div>
        )}
        <div className="text-xs text-muted">Receives your savings if something happens to you.</div>
      </div>

      <details className="rounded-2xl border border-line bg-white">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold">
          Request a change to my details
          <Icon name="chevron" size={18} />
        </summary>
        <div className="px-4 pb-4">
          <ActionForm action={requestDetailsChange} submitLabel="Send to admin" buttonClass={`w-full ${secondaryButton}`} className="flex flex-col gap-3">
            <textarea name="message" required rows={3} aria-label="What should change?" placeholder="e.g. New address: …, or change my nominee to …" className={`${inputClass} h-auto py-3`} />
          </ActionForm>
        </div>
      </details>

      <nav className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="flex min-h-12 items-center justify-between border-b border-[#EFEDE6] px-4 text-sm font-bold text-ink no-underline last:border-0">
            {label}
            <Icon name="chevron" size={18} />
          </Link>
        ))}
      </nav>

      <form action={logout}>
        <button className={`w-full ${secondaryButton}`}>Log out</button>
      </form>

      {deletion ? (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">Deletion request sent. The admin will contact you about your settlement. You can cancel until it is approved.</Notice>
          {deletion.status === "PENDING" && (
            <form action={cancelWithdrawal.bind(null, deletion.id)}>
              <button className={`w-full text-bad ${secondaryButton}`}>Cancel request</button>
            </form>
          )}
        </div>
      ) : (
        <details className="group">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-center text-sm font-bold text-bad">Delete my account</summary>
          <div className="mt-2 flex flex-col gap-3 rounded-2xl border-2 border-bad-bg bg-white p-4 text-sm leading-relaxed">
            <h2 className="text-base font-extrabold">Delete your account?</h2>
            <p>Deleting your account means <strong>leaving the society</strong>. It works like a full withdrawal:</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>You receive your settlement, estimated <strong>{$(position.net)}</strong>.</li>
              <li>Your login stops working after the payout.</li>
              <li>Your NID, address and nominee details are erased.</li>
              <li>Payment records and receipts are kept for 7 years, as the law and the society&apos;s accounts require.</li>
            </ul>
            <form action={requestAccountDeletion}>
              <button className="h-12 w-full rounded-xl bg-bad text-[15px] font-bold text-white">Send deletion request to admin</button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}
