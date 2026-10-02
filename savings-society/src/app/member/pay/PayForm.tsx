"use client";

import { useActionState, useState } from "react";
import { submitPayment, type PayState } from "./actions";
import { Icon } from "@/components/icons";
import { inputClass, labelClass, primaryButton } from "@/components/ui";

const initialState: PayState = {};
const METHODS: Array<[string, string]> = [
  ["BKASH", "bKash"],
  ["NAGAD", "Nagad"],
  ["BANK", "Bank"],
  ["CASH", "Cash"],
];

const chip = (on: boolean) =>
  `flex h-11 cursor-pointer items-center justify-center rounded-xl bg-white px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
    on ? "border-2 border-brand font-bold text-ink" : "border border-field font-semibold text-muted"
  }`;

export function PayForm({
  months,
  monthly,
  currency,
  monthlyLabel,
  paymentInfo,
  today,
}: {
  months: Array<{ key: string; label: string; due: boolean }>;
  monthly: number;
  currency: string;
  monthlyLabel: string;
  paymentInfo: string | null;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(submitPayment, initialState);
  const [picked, setPicked] = useState<string[]>([months[0].key]);
  const [method, setMethod] = useState("BKASH");
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const total = new Intl.NumberFormat("en-IN").format(picked.length * monthly);

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>Paying for · pick one or more months</legend>
        <div className="flex flex-wrap gap-2">
          {months.map((m) => {
            const on = picked.includes(m.key);
            return (
              <label key={m.key} className={chip(on)}>
                <input
                  type="checkbox"
                  name="months"
                  value={m.key}
                  checked={on}
                  onChange={() => setPicked(on ? picked.filter((k) => k !== m.key) : [...picked, m.key].sort())}
                  className="sr-only"
                />
                {m.label}
                {m.due && <span className="ml-1.5 text-xs font-bold text-bad">due</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] text-muted">
            {picked.length === 1 ? "Deposit for 1 month" : `Deposit for ${picked.length} months · one proof`}
          </div>
          <div className="text-2xl font-extrabold">{currency} {total}</div>
        </div>
        <div className="text-right text-xs leading-snug text-muted">{monthlyLabel} a month<br />set by admin</div>
      </div>

      {paymentInfo && (
        <div className="whitespace-pre-line rounded-2xl border border-line bg-white px-4 py-3 text-[13px] leading-relaxed">
          <p className="font-bold">Where to send money</p>
          {paymentInfo}
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>How did you pay?</legend>
        <div className="grid grid-cols-4 gap-2">
          {METHODS.map(([value, label]) => (
            <label key={value} className={chip(method === value)}>
              <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label htmlFor="reference" className={labelClass}>{method === "CASH" ? "Receipt no. (optional)" : "Transaction ID / reference"}</label>
          <input id="reference" name="reference" required={method !== "CASH"} autoCapitalize="characters" className={inputClass} />
        </div>
        <div>
          <label htmlFor="paidOn" className={labelClass}>Paid on</label>
          <input id="paidOn" name="paidOn" type="date" required defaultValue={today} max={today} className={`${inputClass} w-40`} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className={labelClass}>Proof (screenshot or receipt photo)</div>
        <div className="flex gap-2.5">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a served image
            <img src={preview} alt="Selected proof" className="h-28 w-[92px] rounded-xl object-cover" />
          )}
          {!preview && fileName && (
            <div className="flex h-28 w-[92px] items-center justify-center rounded-xl bg-line p-1.5 text-center text-[11px] text-muted">{fileName}</div>
          )}
          <label
            htmlFor="proof"
            className="flex h-28 flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#B9B5A7] text-ink has-[:focus-visible]:ring-2"
          >
            <Icon name="camera" size={24} />
            <span className="text-sm font-semibold">{fileName ? "Change photo" : "Add photo"}</span>
            <span className="text-xs text-muted">Camera or gallery · JPEG, PNG or PDF</span>
            <input
              id="proof"
              name="proof"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setFileName(file?.name ?? null);
                setPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="note" className={labelClass}>Note for admin (optional)</label>
        <input id="note" name="note" placeholder="e.g. Sent from my brother's number" className={inputClass} />
      </div>

      {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{state.error}</p>}

      <button type="submit" disabled={pending || picked.length === 0} className={`h-13 w-full ${primaryButton}`}>
        {pending ? "Uploading…" : "Send to admin for approval"}
      </button>
    </form>
  );
}
