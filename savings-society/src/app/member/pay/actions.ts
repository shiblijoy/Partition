"use server";

import { redirect } from "next/navigation";
import { requireActiveMember } from "@/lib/auth-guard";
import { attempt, changed } from "@/lib/actions";
import { handleSubmission, type PayState } from "./submit";

export async function submitPayment(_prev: PayState, formData: FormData): Promise<PayState> {
  const r = await attempt(async () => {
    const member = await requireActiveMember();
    const result = await handleSubmission(member.userId, formData);
    if (result.ok) changed();
    return result as never;
  });
  const result = r as PayState & { ok?: boolean };
  if (!result.ok) return result;
  redirect("/member/history?submitted=1");
}
