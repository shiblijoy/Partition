"use server";

import { requireActiveMember } from "@/lib/auth-guard";
import { attempt, changed } from "@/lib/actions";
import { castPollVote } from "@/lib/services/polls";
import type { FormState } from "@/components/ActionForm";

export async function votePoll(pollId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const viewer = await requireActiveMember();
    await castPollVote(pollId, viewer.userId, String(formData.get("optionId") ?? ""));
    changed();
    return { ok: "Your vote is saved. You can change it until voting closes." };
  });
}
