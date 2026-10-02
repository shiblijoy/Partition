import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { calendarLink } from "@/lib/calendar";
import { fileUrl } from "@/lib/uploads";
import { Icon } from "@/components/icons";
import { Pill, ScreenHeader, NOTICE_LABELS, type Tone } from "@/components/ui";

const KIND_TONE: Record<string, Tone> = { MEETING: "brand", VOTE: "warn", REMINDER: "neutral", DECISION: "good", GENERAL: "neutral" };

export default async function NoticesPage() {
  const session = await requireMember();
  const notices = await prisma.notice.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  // Opening the page marks everything as read (the admin sees "x / 24 read").
  const read = new Set(
    (await prisma.noticeRead.findMany({ where: { userId: session.userId }, select: { noticeId: true } })).map((r) => r.noticeId)
  );
  const unread = notices.filter((n) => !read.has(n.id));
  if (unread.length) await prisma.noticeRead.createMany({ data: unread.map((n) => ({ noticeId: n.id, userId: session.userId })) });

  return (
    <div className="flex flex-col gap-3">
      <ScreenHeader title="Notices" back="/member" />
      {notices.length === 0 && <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">No notices yet.</p>}
      {notices.map((n) => (
        <article key={n.id} className={`flex flex-col gap-2 rounded-2xl bg-white p-4 ${n.kind === "MEETING" ? "border-2 border-brand" : "border border-line"}`}>
          <div className="flex items-center justify-between gap-2">
            <Pill tone={KIND_TONE[n.kind]}>{NOTICE_LABELS[n.kind]}</Pill>
            <span className="text-xs text-muted">{fmtDay(n.createdAt)}</span>
          </div>
          <h2 className="text-base font-extrabold">{n.title}</h2>
          {n.eventAt && (
            <div className="flex flex-col text-sm font-semibold">
              <span>{fmtDateTime(n.eventAt)}</span>
              {n.place && <span className="text-muted">{n.place}</span>}
            </div>
          )}
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">{n.body}</p>
          <div className="flex flex-wrap gap-4">
            {n.eventAt && (
              <a href={calendarLink(n.title, n.eventAt, n.place, n.body)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-1.5 text-[13px] font-bold">
                <Icon name="calendar" size={18} /> Add to calendar
              </a>
            )}
            {n.attachmentPath && (
              <a href={fileUrl(n.attachmentPath)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-1.5 text-[13px] font-bold">
                <Icon name="file" size={18} /> Attachment
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
