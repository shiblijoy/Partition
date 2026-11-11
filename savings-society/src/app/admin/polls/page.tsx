import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import { dateTimeInput, fmtDateTime } from "@/lib/format";
import { pollResult, pollState, pollVoterIds, type PollState } from "@/lib/services/polls";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Card, Empty, PageHeader, Pill, inputClass, labelClass, smallSecondary, textareaClass } from "@/components/ui";
import { addPoll, adminVote, endPoll, removePoll } from "./actions";

const STATE_PILL: Record<PollState, { label: string; tone: "good" | "warn" | "neutral" | "bad" }> = {
  open: { label: "Voting open", tone: "good" },
  upcoming: { label: "Not open yet", tone: "warn" },
  closed: { label: "Closed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

/** Polls: only admins create them; the counts are shown to staff only (members see the winning choice). */
export default async function PollsPage() {
  const viewer = await requireStaff();
  const canEdit = viewer.role === "ADMIN";
  const polls = await prisma.poll.findMany({ include: { options: true, votes: { select: { optionId: true, userId: true } } }, orderBy: { closesAt: "desc" }, take: 100 });
  const [memberIds, adminIds] = await Promise.all([pollVoterIds("MEMBERS"), pollVoterIds("ADMINS")]);
  const now = new Date();
  const order: PollState[] = ["open", "upcoming", "closed", "cancelled"];
  const sorted = [...polls].sort((a, b) => order.indexOf(pollState(a, now)) - order.indexOf(pollState(b, now)));
  const inAWeek = new Date(now.getTime() + 7 * 86_400_000);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Polls" subtitle="Ask the members or the admins a question with a time limit. Members see the result; only admins see the vote counts." back={{ href: "/admin", label: "Dashboard" }} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
          {sorted.length === 0 && <Card><Empty>No polls yet.</Empty></Card>}
          {sorted.map((p) => {
            const state = pollState(p, now);
            const r = pollResult(p);
            const eligible = p.audience === "ADMINS" ? adminIds.length : memberIds.length;
            const mine = p.votes.find((v) => v.userId === viewer.userId)?.optionId;
            const pill = STATE_PILL[state];
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold">{p.question}</h2>
                    <p className="text-[13px] text-muted">
                      {p.audience === "ADMINS" ? "Admins only" : "All members"} · {fmtDateTime(p.opensAt)} – {fmtDateTime(p.closesAt)}
                    </p>
                    {p.details && <p className="mt-1 whitespace-pre-line text-sm">{p.details}</p>}
                  </div>
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                </div>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {r.counts.map((c) => {
                    const pct = r.total ? Math.round((c.votes / r.total) * 100) : 0;
                    const lead = state === "closed" && r.winners.includes(c.label);
                    return (
                      <li key={c.optionId} className="flex flex-col gap-1">
                        <div className="flex justify-between gap-2 text-sm">
                          <span className={lead ? "font-extrabold" : "font-semibold"}>{c.label}{lead && " ✓"}</span>
                          <span className="font-bold">{c.votes} <span className="font-normal text-muted">({pct}%)</span></span>
                        </div>
                        <div className="h-2 overflow-hidden rounded bg-[#ECEAE2]" role="presentation">
                          <div className={`h-2 ${lead ? "bg-brand" : "bg-[#8FB5A6]"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[13px] text-muted">
                  {r.total} of {eligible} voted{state === "closed" ? ` · result: ${r.winners.length === 0 ? "no votes" : r.winners.length > 1 ? `tie between ${r.winners.join(" and ")}` : r.winners[0]}` : ""}
                </p>

                {canEdit && p.audience === "ADMINS" && state === "open" && (
                  <ActionForm action={adminVote.bind(null, p.id)} submitLabel={mine ? "Change my vote" : "Vote"} buttonClass={smallSecondary} resetOnSuccess={false} className="mt-3 flex flex-wrap items-center gap-3">
                    {r.counts.map((c) => (
                      <label key={c.optionId} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                        <input type="radio" name="optionId" value={c.optionId} required defaultChecked={mine === c.optionId} className="h-5 w-5 accent-brand" />
                        {c.label}
                      </label>
                    ))}
                  </ActionForm>
                )}
                {canEdit && (state === "open" || state === "upcoming") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {state === "open" && <ConfirmButton action={endPoll.bind(null, p.id)} confirmText="End voting now? The result is taken as it stands." className={smallSecondary}>End voting now</ConfirmButton>}
                    <ConfirmButton action={removePoll.bind(null, p.id)} confirmText="Cancel this poll? Its votes are not counted." className={`${smallSecondary} text-bad`}>Cancel poll</ConfirmButton>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {canEdit && (
          <Card title="New poll" className="flex-[2_1_320px]">
            <ActionForm action={addPoll} submitLabel="Create poll" className="flex flex-col gap-3">
              <div>
                <label htmlFor="pl-q" className={labelClass}>Question</label>
                <input id="pl-q" name="question" required placeholder="e.g. Where should we hold the annual meeting?" className={inputClass} />
              </div>
              <div>
                <label htmlFor="pl-d" className={labelClass}>Details (optional)</label>
                <textarea id="pl-d" name="details" rows={2} className={textareaClass} />
              </div>
              <div>
                <label htmlFor="pl-o" className={labelClass}>Choices, one per line</label>
                <textarea id="pl-o" name="options" rows={4} required defaultValue={"Yes\nNo"} className={textareaClass} />
              </div>
              <fieldset>
                <legend className={`${labelClass} mb-1`}>Who votes</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="radio" name="audience" value="MEMBERS" defaultChecked className="h-5 w-5 accent-brand" /> All members ({memberIds.length})</label>
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="radio" name="audience" value="ADMINS" className="h-5 w-5 accent-brand" /> Admins only ({adminIds.length})</label>
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pl-open" className={labelClass}>Voting opens</label>
                  <input id="pl-open" name="opensAt" type="datetime-local" required defaultValue={dateTimeInput(now)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="pl-close" className={labelClass}>Voting closes</label>
                  <input id="pl-close" name="closesAt" type="datetime-local" required defaultValue={dateTimeInput(inAWeek)} className={inputClass} />
                </div>
              </div>
              <p className="text-xs text-muted">Voters get a notification (with sound) when voting opens and when the result is in. Each person has one vote and can change it until voting closes. Nobody sees who voted for what.</p>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
