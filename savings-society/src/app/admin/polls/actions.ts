"use server";

import type { PollAudience } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-guard";
import { attempt, changed, text } from "@/lib/actions";
import { cancelPoll, castPollVote, closePollNow, createPoll } from "@/lib/services/polls";
import { ServiceError } from "@/lib/errors";
import type { FormState } from "@/components/ActionForm";

const actorOf = (v: { userId: string; name: string }) => ({ id: v.userId, name: v.name });

export async function addPoll(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const audience: PollAudience = formData.get("audience") === "ADMINS" ? "ADMINS" : "MEMBERS";
    const options = String(formData.get("options") ?? "").split(/\r?\n/);
    await createPoll({
      question: text(formData, "question") ?? "",
      details: text(formData, "details"),
      audience,
      options,
      opensAt: new Date(String(formData.get("opensAt") ?? "")),
      closesAt: new Date(String(formData.get("closesAt") ?? "")),
      actor: actorOf(admin),
    });
    changed();
    return { ok: audience === "ADMINS" ? "Poll created. The admins are notified when it opens." : "Poll created. Every member is notified when it opens." };
  });
}

/** An admin's own vote in an admins-only poll. */
export async function adminVote(pollId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await castPollVote(pollId, admin.userId, String(formData.get("optionId") ?? ""));
    changed();
    return { ok: "Your vote is saved. You can change it until voting closes." };
  });
}

// Used by confirm buttons: a refusal (already closed, etc.) just leaves the poll as it is.
const ignoreRefusal = (err: unknown) => {
  if (!(err instanceof ServiceError)) throw err;
};

export async function endPoll(pollId: string): Promise<void> {
  const admin = await requireAdmin();
  await closePollNow(pollId, actorOf(admin)).catch(ignoreRefusal);
  changed();
}

export async function removePoll(pollId: string): Promise<void> {
  const admin = await requireAdmin();
  await cancelPoll(pollId, actorOf(admin)).catch(ignoreRefusal);
  changed();
}
