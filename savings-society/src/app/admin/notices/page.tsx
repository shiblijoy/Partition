import { prisma } from "@/lib/prisma";
import { fundSummary } from "@/lib/society";
import { fmtDay } from "@/lib/format";
import { Card, Empty, PageHeader, NOTICE_LABELS, dangerLink } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { NoticeForm } from "./NoticeForm";
import { deleteNotice } from "./actions";

export default async function AdminNoticesPage() {
  const [notices, fund] = await Promise.all([
    prisma.notice.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { reads: { where: { user: { role: "MEMBER" } } } } } } }),
    fundSummary(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notice board" back={{ href: "/admin", label: "Dashboard" }} />
      <div className="flex flex-wrap items-start gap-6">
        <Card title="Post a notice" className="flex-[2_1_420px]">
          <NoticeForm />
        </Card>
        <Card title="Posted" className="min-w-0 flex-[3_1_480px]">
          {notices.length === 0 ? (
            <Empty>Nothing posted yet.</Empty>
          ) : (
            <ul className="flex flex-col">
              {notices.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEDE6] py-3 last:border-0">
                  <div className="min-w-0">
                    <div className="font-bold">{n.title}</div>
                    <div className="text-xs text-muted">{NOTICE_LABELS[n.kind]} · {fmtDay(n.createdAt)}{n.attachmentPath && " · file attached"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-bold ${n._count.reads >= fund.activeMembers ? "text-good" : "text-muted"}`}>
                      {n._count.reads} / {fund.activeMembers} read
                    </span>
                    <ConfirmButton action={deleteNotice.bind(null, n.id)} confirmText="Delete this notice?" className={dangerLink}>Delete</ConfirmButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
