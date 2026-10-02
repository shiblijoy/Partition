"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { fileClass, inputClass, labelClass, METHOD_LABELS } from "@/components/ui";
import { recordPayment } from "../actions";

const chip = (on: boolean) =>
  `flex h-11 cursor-pointer items-center justify-center rounded-xl bg-white px-3 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
    on ? "border-2 border-brand font-bold text-ink" : "border border-field font-semibold text-muted"
  }`;

export function RecordPaymentForm({
  memberId,
  months,
  monthly,
  currency,
  today,
}: {
  memberId: string;
  months: Array<{ key: string; label: string }>;
  monthly: number;
  currency: string;
  today: string;
}) {
  const [picked, setPicked] = useState<string[]>([months[0].key]);
  const [method, setMethod] = useState("CASH");

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
      <fieldset>
        <legend className={`${labelClass} mb-1.5`}>Method</legend>
        <div className="flex flex-wrap gap-2">
          {["CASH", "BKASH", "NAGAD", "BANK"].map((value) => (
            <label key={value} className={chip(method === value)}>
              <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
              {METHOD_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="paidOn" className={labelClass}>Date received</label>
          <input id="paidOn" name="paidOn" type="date" required defaultValue={today} max={today} className={inputClass} />
        </div>
        <div>
          <label htmlFor="reference" className={labelClass}>Reference (optional)</label>
          <input id="reference" name="reference" className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="proof" className={labelClass}>Attach photo of cash receipt (optional)</label>
        <input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
      </div>
      <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm">
        <span className="text-muted">{picked.length} month(s) · marked &ldquo;Recorded by admin&rdquo;</span>
        <strong className="text-lg">{currency} {new Intl.NumberFormat("en-IN").format(picked.length * monthly)}</strong>
      </div>
    </ActionForm>
  );
}
