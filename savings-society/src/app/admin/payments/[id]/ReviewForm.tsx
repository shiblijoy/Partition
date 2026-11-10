"use client";

import { useActionState, useState } from "react";
import { decidePayment } from "../actions";
import type { FormState } from "@/components/ActionForm";
import { AccountSelect, type AccountOption } from "@/components/AccountSelect";
import { inputClass, labelClass, primaryButton, secondaryButton, textareaClass } from "@/components/ui";

export function ReviewForm({ paymentId, amount, accounts, paidOn, today }: { paymentId: string; amount: string; accounts: AccountOption[]; paidOn: string; today: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(decidePayment.bind(null, paymentId), {});
  const [checked, setChecked] = useState<string[]>([]);
  const checks: Array<[string, string]> = [
    ["received", "Money received in society account"],
    ["amount", `Amount matches ${amount}`],
    ["txn", "Transaction ID matches statement"],
  ];

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-base font-extrabold">Check before approving</legend>
        {checks.map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              name="check"
              value={value}
              checked={checked.includes(value)}
              onChange={(e) => setChecked(e.target.checked ? [...checked, value] : checked.filter((c) => c !== value))}
              className="h-5 w-5 accent-brand"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="receivedOn" className={labelClass}>Date money arrived</label>
          <input id="receivedOn" name="receivedOn" type="date" required defaultValue={paidOn} max={today} className={inputClass} />
        </div>
        <AccountSelect accounts={accounts} label="Arrived in" id="review-account" />
      </div>
      <div id="reject">
        <label htmlFor="message" className={labelClass}>Message to member (required if rejecting)</label>
        <textarea id="message" name="message" rows={3} placeholder="e.g. Amount not found in the society account. Please resubmit with the bank slip." className={textareaClass} />
      </div>
      {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{state.error}</p>}
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <button name="decision" value="approve" disabled={pending || checked.length < 3} className={primaryButton}>
          Approve &amp; send receipt
        </button>
        <button name="decision" value="reject" disabled={pending} className={`${secondaryButton} h-12 text-bad`}>
          Reject
        </button>
      </div>
    </form>
  );
}
