"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { inputClass, labelClass, primaryButton } from "@/components/ui";
import { requestWithdrawal } from "./actions";

const option = (on: boolean) =>
  `flex cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-white px-3.5 py-3 text-left text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
    on ? "border-2 border-brand" : "border border-field"
  }`;

export function WithdrawForm({ defaultPayTo, currency }: { defaultPayTo: string; currency: string }) {
  const [kind, setKind] = useState<"FULL" | "PARTIAL">("FULL");
  return (
    <ActionForm action={requestWithdrawal} submitLabel="Send request to admin" buttonClass={`h-13 w-full ${primaryButton}`} resetOnSuccess={false}>
      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>What do you want?</legend>
        <label className={option(kind === "FULL")}>
          <input type="radio" name="kind" value="FULL" checked={kind === "FULL"} onChange={() => setKind("FULL")} className="sr-only" />
          <span className="font-bold">Leave the society</span>
          <span className="text-xs text-muted">Get your full settlement, membership ends</span>
        </label>
        <label className={option(kind === "PARTIAL")}>
          <input type="radio" name="kind" value="PARTIAL" checked={kind === "PARTIAL"} onChange={() => setKind("PARTIAL")} className="sr-only" />
          <span className="font-bold">Take out part of my savings</span>
          <span className="text-xs text-muted">Stay a member, if the society&apos;s rules allow</span>
        </label>
      </fieldset>
      {kind === "PARTIAL" && (
        <div>
          <label htmlFor="amount" className={labelClass}>Amount ({currency})</label>
          <input id="amount" name="amount" type="number" inputMode="numeric" min="1" required className={inputClass} />
        </div>
      )}
      <div>
        <label htmlFor="payTo" className={labelClass}>Send money to</label>
        <input id="payTo" name="payTo" required defaultValue={`bKash ${defaultPayTo}`} className={inputClass} />
      </div>
      <div>
        <label htmlFor="reason" className={labelClass}>Reason (optional)</label>
        <input id="reason" name="reason" placeholder="Helps the admin plan" className={inputClass} />
      </div>
    </ActionForm>
  );
}
