import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { tFor, dateName } from "@/lib/i18n";
import { pollResult, pollState } from "@/lib/services/polls";
import { ActionForm } from "@/components/ActionForm";
import { votePoll } from "./actions";

/** The members' polls: vote while a poll is open, see the winning choice once it closes (no counts). */
export default async function VotePage() {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const lang = viewer.language;
  const polls = await prisma.poll.findMany({
    where: { audience: "MEMBERS", cancelledAt: null },
    include: { options: true, votes: { select: { optionId: true, userId: true } } },
    orderBy: { closesAt: "desc" },
    take: 50,
  });
  const now = new Date();
  const open = polls.filter((p) => pollState(p, now) === "open").sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime());
  const upcoming = polls.filter((p) => pollState(p, now) === "upcoming");
  const closed = polls.filter((p) => pollState(p, now) === "closed");
  const when = (d: Date) => `${dateName(d, lang, false)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[22px] font-bold">{t("Vote")}</h1>
      <p className="text-[13px] text-muted">{t("One vote each. You can change it until voting closes. Nobody sees who voted for what, and only the admins see the counts.")}</p>

      {open.length === 0 && upcoming.length === 0 && closed.length === 0 && (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">{t("No polls yet.")}</p>
      )}

      {open.map((p) => {
        const mine = p.votes.find((v) => v.userId === viewer.userId)?.optionId;
        const options = [...p.options].sort((a, b) => a.position - b.position);
        return (
          <section key={p.id} className="flex flex-col gap-2.5 rounded-2xl border-2 border-[#E8B567] bg-white p-4">
            <div className="text-xs font-extrabold tracking-wide text-warn">{t("VOTING OPEN · CLOSES {date}", { date: when(p.closesAt).toUpperCase() })}</div>
            <h2 className="text-base font-extrabold">{p.question}</h2>
            {p.details && <p className="whitespace-pre-line text-[13px] text-muted">{p.details}</p>}
            {viewer.readOnly ? (
              <p className="text-[13px] text-muted">{t("Your membership has ended, so you can't vote.")}</p>
            ) : (
              <ActionForm action={votePoll.bind(null, p.id)} submitLabel={mine ? t("Change my vote") : t("Vote")} resetOnSuccess={false} className="flex flex-col gap-2">
                {options.map((o) => (
                  <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-field px-3 text-sm font-semibold has-[:checked]:border-2 has-[:checked]:border-brand">
                    <input type="radio" name="optionId" value={o.id} required defaultChecked={mine === o.id} className="h-5 w-5 accent-brand" />
                    {o.label}
                  </label>
                ))}
              </ActionForm>
            )}
            {mine && <p className="text-xs font-bold text-good">{t("You voted: {choice}", { choice: options.find((o) => o.id === mine)?.label ?? "" })}</p>}
          </section>
        );
      })}

      {upcoming.map((p) => (
        <section key={p.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-4">
          <div className="text-xs font-extrabold tracking-wide text-muted">{t("OPENS {date}", { date: when(p.opensAt).toUpperCase() })}</div>
          <h2 className="text-base font-extrabold">{p.question}</h2>
          {p.details && <p className="whitespace-pre-line text-[13px] text-muted">{p.details}</p>}
        </section>
      ))}

      {closed.length > 0 && <h2 className="pt-2 text-[15px] font-bold">{t("Results")}</h2>}
      {closed.map((p) => {
        const r = pollResult(p);
        const mine = p.votes.find((v) => v.userId === viewer.userId)?.optionId;
        return (
          <section key={p.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-4">
            <div className="text-xs text-muted">{t("Closed {date}", { date: when(p.closesAt) })}</div>
            <h2 className="text-[15px] font-extrabold">{p.question}</h2>
            <p className="text-sm">
              {r.winners.length === 0
                ? t("No votes were cast.")
                : r.winners.length > 1
                  ? t("Result: a tie between {choices}", { choices: r.winners.join(" / ") })
                  : t("Result: {choice}", { choice: r.winners[0] })}
            </p>
            {mine && <p className="text-xs text-muted">{t("You voted: {choice}", { choice: p.options.find((o) => o.id === mine)?.label ?? "" })}</p>}
          </section>
        );
      })}
    </div>
  );
}
