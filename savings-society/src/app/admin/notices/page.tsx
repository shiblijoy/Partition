import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { fundSummary } from "@/lib/society";
import { fmtDay } from "@/lib/format";
import { Card, Empty, PageHeader, NOTICE_LABELS, dangerLink, smallSecondary, textareaClass } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { NoticeForm } from "./NoticeForm";
import { deleteNotice, saveMinutes } from "./actions";

export default async function AdminNoticesPage() {
  const viewer = await requireStaff();
  const canEdit = viewer.role === "ADMIN";
  const [notices, fund, proposals] = await Promise.all([
    prisma.notice.findMany({ orderBy: { createdAt: "desc" }, include: { investment: { select: { name: true } }, _count: { select: { reads: { where: { user: { role: "MEMBER" } } } } } } }),
    fundSummary(),
    prisma.investment.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true }, take: 30 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notice board" back={{ href: "/admin", label: "Dashboard" }} />
      <div className="flex flex-wrap items-start gap-6">
        {canEdit && <Card title="Post a notice" className="flex-[2_1_420px]"><NoticeForm proposals={proposals} /></Card>}
        <Card title="Posted" className="min-w-0 flex-[3_1_480px]">
          {notices.length === 0 ? (
            <Empty>Nothing posted yet.</Empty>
          ) : (
            <ul className="flex flex-col">
              {notices.map((n) => (
                <li key={n.id} className="flex flex-col gap-2 border-b border-[#EFEDE6] py-3 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold">{n.title}</div>
                      <div className="text-xs text-muted">{NOTICE_LABELS[n.kind]} · {fmtDay(n.createdAt)}{n.attachmentPath && " · file attached"}{n.investment && ` · about ${n.investment.name}`}{n.minutes && " · minutes recorded"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-bold ${n._count.reads >= fund.activeMembers ? "text-good" : "text-muted"}`}>{n._count.reads} / {fund.activeMembers} read</span>
                      {canEdit && <ConfirmButton action={deleteNotice.bind(null, n.id)} confirmText="Delete this notice?" className={dangerLink}>Delete</ConfirmButton>}
                    </div>
                  </div>
                  {canEdit && (n.kind === "MEETING" || n.kind === "DECISION" || n.minutes) && (
                    <details>
                      <summary className={`${smallSecondary} cursor-pointer list-none`}>{n.minutes ? "Edit minutes" : "Add minutes & decisions"}</summary>
                      <ActionForm action={saveMinutes.bind(null, n.id)} submitLabel="Save minutes" buttonClass={smallSecondary} resetOnSuccess={false} className="mt-2 flex flex-col gap-2">
                        <textarea name="minutes" rows={4} defaultValue={n.minutes ?? ""} aria-label="Minutes" className={textareaClass} />
                        <select name="investmentId" defaultValue={n.investmentId ?? ""} aria-label="Linked proposal" className="h-10 rounded-lg border border-field px-2 text-sm">
                          <option value="">Not linked to a proposal</option>
                          {proposals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </ActionForm>
                    </details>
                  )}
                  {!canEdit && n.minutes && <p className="whitespace-pre-line rounded-lg bg-paper p-2 text-[13px]">{n.minutes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
