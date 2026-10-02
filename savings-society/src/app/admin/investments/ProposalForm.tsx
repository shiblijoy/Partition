"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { fileClass, inputClass, labelClass } from "@/components/ui";
import { votesNeeded } from "@/lib/votes";
import { proposeInvestment } from "./actions";

const seg = (on: boolean) =>
  `flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-[13px] ${on ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-muted"}`;

const COPY = {
  LAND: ["Name and location", "e.g. 3 katha, [Mouza / Area]", "Expected resale value / plan", "e.g. Hold 3 years, sell or build", "Attach deed, khatian, survey map"],
  BUSINESS: ["Business name and partner", "e.g. [Name] grocery, partner [Name]", "Profit terms", "e.g. 30% of monthly profit", "Attach agreement, trade licence"],
  SHARES: ["Company name and number of shares", "e.g. [Company] Ltd, 1,000 shares at [price]", "Broker and BO account", "e.g. [Broker], BO ••XXXX", "Attach company profile, price quote"],
} as const;

export function ProposalForm({ cash, cashLabel, currency, members, defaultRule, nextWeek }: { cash: number; cashLabel: string; currency: string; members: number; defaultRule: "MAJORITY" | "TWO_THIRDS" | "EVERYONE"; nextWeek: string }) {
  const [kind, setKind] = useState<"LAND" | "BUSINESS" | "SHARES">("LAND");
  const [amount, setAmount] = useState("");
  const [rule, setRule] = useState(defaultRule);
  const [nameLabel, namePh, planLabel, planPh, docLabel] = COPY[kind];
  const after = cash - (Number(amount) || 0);


  return (
    <ActionForm action={proposeInvestment} submitLabel="Send to members for vote">
      <div className="flex gap-1 rounded-xl bg-line p-1">
        {(["LAND", "BUSINESS", "SHARES"] as const).map((k) => (
          <label key={k} className={seg(kind === k)}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k.charAt(0) + k.slice(1).toLowerCase()}
          </label>
        ))}
      </div>
      <div>
        <label htmlFor="p-name" className={labelClass}>{nameLabel}</label>
        <input id="p-name" name="name" required placeholder={namePh} className={inputClass} />
      </div>
      <div>
        <label htmlFor="p-amount" className={labelClass}>Amount needed ({currency})</label>
        <input id="p-amount" name="amount" type="number" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="p-plan" className={labelClass}>{planLabel}</label>
        <input id="p-plan" name="plan" placeholder={planPh} className={inputClass} />
      </div>
      <div>
        <label htmlFor="p-details" className={labelClass}>Details (optional)</label>
        <input id="p-details" name="details" placeholder="Registration, partner contact, …" className={inputClass} />
      </div>
      <div>
        <label htmlFor="p-docs" className={labelClass}>{docLabel}</label>
        <input id="p-docs" name="documents" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
      </div>
      <p className={`rounded-xl p-3 text-[13px] ${after < 0 ? "bg-bad-bg text-bad" : "bg-paper"}`}>
        Cash available after this: <strong>{currency} {new Intl.NumberFormat("en-IN").format(after)}</strong>
        {after < 0 ? " — not enough. Wait for more deposits or lower the amount." : ` (now ${cashLabel})`}
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className={`${labelClass} mb-1.5`}>Members must approve</legend>
        {(["MAJORITY", "TWO_THIRDS", "EVERYONE"] as const).map((r) => (
          <label key={r} className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input type="radio" name="voteRule" value={r} checked={rule === r} onChange={() => setRule(r)} className="h-5 w-5 accent-brand" />
            {r === "MAJORITY" ? "Majority" : r === "TWO_THIRDS" ? "Two-thirds" : "Everyone"} ({votesNeeded(r, members)} of {members})
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="p-ends" className={labelClass}>Voting ends</label>
        <input id="p-ends" name="voteEndsAt" type="date" required defaultValue={nextWeek} className={inputClass} />
      </div>
    </ActionForm>
  );
}
