"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { fileClass, inputClass, labelClass } from "@/components/ui";
import { recordPayment } from "../actions";
import { AccountSelect, type AccountOption } from "@/components/AccountSelect";

const chip = (on: boolean) =>
  `flex h-11 cursor-pointer items-center justify-center rounded-xl bg-white px-3 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
    on ? "border-2 border-brand font-bold text-ink" : "border border-field font-semibold text-muted"
  }`;

export function RecordPaymentForm({
  memberId,
  months,
  currency,
  today,
  accounts,
}: {
  memberId: string;
  months: Array<{ key: string; label: string; amount: number }>;
  currency: string;
  today: string;
  accounts: AccountOption[];
}) {
  const [picked, setPicked] = useState<string[]>(months[0] ? [months[0].key] : []);
  const total = months.filter((m) => picked.includes(m.key)).reduce((s, m) => s + m.amount, 0);

  return (
    <ActionForm action={recordPayment.bind(null, memberId)} submitLabel="Record & issue receipts" resetOnSuccess={false}>
      <fieldset>
        <legend className={`${labelClass} mb-1.5`}>Months</legend>
        <div className="flex flex-wrap gap-2">
          {months.map((m) => {
            const on = picked.includes(m.key);
            return (
              <label key={m.key} className={chip(on)}>
                <input type="checkbox" name="months" value={m.key} checked={on} onChange={() => setPicked(on ? picked.filter((k) => k !== m.key) : [...picked, m.key])} className="sr-only" />
                {m.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <input type="hidden" name="method" value="BANK" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="paidOn" className={labelClass}>Date received</label>
          <input id="paidOn" name="paidOn" type="date" required defaultValue={today} max={today} className={inputClass} />
        </div>
        <div>
          <label htmlFor="reference" className={labelClass}>Bank reference (optional)</label>
          <input id="reference" name="reference" className={inputClass} />
        </div>
        <AccountSelect accounts={accounts} label="Received into" id="rec-account" />
      </div>
      <div>
        <label htmlFor="proof" className={labelClass}>Attach the bank slip (optional)</label>
        <input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
      </div>
      <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm">
        <span className="text-muted">{picked.length} month(s) · marked &ldquo;Recorded by admin&rdquo;</span>
        <strong className="text-lg">{currency} {new Intl.NumberFormat("en-IN").format(total)}</strong>
      </div>
    </ActionForm>
  );
}
