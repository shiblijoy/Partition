"use client";

import { useActionState } from "react";
import type { FormState } from "@/components/ActionForm";
import { smallButton } from "@/components/ui";

/** FR-APR-07 with FR-APR-03: approve straight from the queue, still confirming the date the money arrived and the account. */
export function QuickApprove({ action, paidOn, today, accounts }: { action: (p: FormState, f: FormData) => Promise<FormState>; paidOn: string; today: string; accounts: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(action, {});
  if (state.ok) return <span className="text-[13px] font-bold text-good">{state.ok}</span>;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input name="receivedOn" type="date" required defaultValue={paidOn} max={today} aria-label="Date money arrived" className="h-9 w-36 rounded-lg border border-field px-2 text-[13px]" />
      <select name="accountId" aria-label="Arrived in account" className="h-9 max-w-36 rounded-lg border border-field px-1 text-[13px]">
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button disabled={pending} className={smallButton}>{pending ? "…" : "Approve"}</button>
      {state.error && <span className="w-full text-xs font-semibold text-bad">{state.error}</span>}
    </form>
  );
}
