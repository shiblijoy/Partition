import Link from "next/link";
import { parseChanges } from "@/lib/profile-fields";
import { fmtDay } from "@/lib/format";
import { approveDetailsChange, rejectDetailsChange } from "@/app/admin/members/actions";
import { ActionForm } from "@/components/ActionForm";
import { ChangeList } from "@/components/ChangeList";
import { ConfirmButton } from "@/components/ConfirmButton";
import { inputClass, smallButton, smallSecondary } from "@/components/ui";

/** A member's proposed edits to their details, for the admin to approve or reject. */
export function PendingDetailsChange({
  request,
  showMember = false,
}: {
  request: { id: string; memberId: string; changes: string | null; createdAt: Date; member: { name: string } };
  showMember?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-[#E8B567] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <strong>{showMember ? <Link href={`/admin/members/${request.memberId}`}>{request.member.name}</Link> : "The member"}</strong> edited their details · {fmtDay(request.createdAt)}
        </div>
        <span className="text-xs font-extrabold tracking-wide text-warn">NEEDS APPROVAL</span>
      </div>
      <ChangeList changes={parseChanges(request.changes)} />
      <div className="flex flex-wrap items-start gap-2">
        <ConfirmButton action={approveDetailsChange.bind(null, request.id)} confirmText={`Apply ${request.member.name}'s changes?`} className={smallButton}>
          Approve changes
        </ConfirmButton>
        <details>
          <summary className={`${smallSecondary} cursor-pointer list-none text-bad`}>Reject</summary>
          <ActionForm action={rejectDetailsChange.bind(null, request.id)} submitLabel="Reject" buttonClass={`${smallSecondary} text-bad`} className="mt-2 flex flex-wrap items-center gap-2">
            <input name="note" required aria-label="Reason, shown to the member" placeholder="Reason, shown to the member" className={`${inputClass} mt-0 h-10 w-64`} />
          </ActionForm>
        </details>
      </div>
    </div>
  );
}
