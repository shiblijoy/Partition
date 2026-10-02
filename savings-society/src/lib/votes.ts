import type { VoteRule } from "@prisma/client";

/** Yes votes a proposal needs to pass, out of the active members. */
export function votesNeeded(rule: VoteRule, members: number): number {
  if (rule === "EVERYONE") return members;
  if (rule === "TWO_THIRDS") return Math.ceil((members * 2) / 3);
  return Math.floor(members / 2) + 1;
}

export function tally(votes: Array<{ choice: "YES" | "NO" }>, rule: VoteRule, members: number) {
  const yes = votes.filter((v) => v.choice === "YES").length;
  const no = votes.length - yes;
  const needed = votesNeeded(rule, members);
  return {
    yes,
    no,
    needed,
    passed: yes >= needed,
    // Can it still pass if everyone who hasn't voted says yes?
    canPass: yes + (members - yes - no) >= needed,
  };
}
