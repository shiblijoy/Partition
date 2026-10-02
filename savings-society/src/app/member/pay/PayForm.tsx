"use client";

import { useActionState, useState } from "react";
import { submitPayment, type PayState } from "./actions";
import { inputClass, labelClass, primaryButton, METHOD_LABELS } from "@/components/ui";

const initialState: PayState = {};

export function PayForm({
  defaultMonth,
  defaultAmount,
  today,
}: {
  defaultMonth: string;
  defaultAmount: number;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(submitPayment, initialState);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="forMonth" className={labelClass}>For month</label>
          <input id="forMonth" name="forMonth" type="month" required defaultValue={defaultMonth} className={inputClass} />
        </div>
        <div>
          <label htmlFor="amount" className={labelClass}>Amount</label>
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min="1"
            step="any"
            required
            defaultValue={defaultAmount}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">Paying for several months? Enter the full amount sent.</p>
        </div>
        <div>
          <label htmlFor="method" className={labelClass}>Paid via</label>
          <select id="method" name="method" required defaultValue="BKASH" className={inputClass}>
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="paidOn" className={labelClass}>Date paid</label>
          <input id="paidOn" name="paidOn" type="date" required defaultValue={today} max={today} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="reference" className={labelClass}>Transaction ID / slip no. <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="reference" name="reference" placeholder="e.g. 9JK2XXXXXX" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="proof" className={labelClass}>Payment proof</label>
        <p className="text-xs text-slate-500">Screenshot of the bKash/Nagad message, or a photo of the bank deposit slip (JPEG, PNG, WebP or PDF, max 10MB).</p>
        <label
          htmlFor="proof"
          className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-teal-400"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a served image
            <img src={preview} alt="Selected proof" className="max-h-60 rounded-md" />
          ) : (
            <>
              <span className="text-3xl">📷</span>
              <span className="mt-1 text-sm font-medium text-teal-700">Tap to take a photo or choose a file</span>
            </>
          )}
        </label>
        <input
          id="proof"
          name="proof"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
          }}
        />
      </div>

      <div>
        <label htmlFor="note" className={labelClass}>Note to admin <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea id="note" name="note" rows={2} className={inputClass} />
      </div>

      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <button type="submit" disabled={pending} className={`w-full sm:w-auto ${primaryButton}`}>
        {pending ? "Uploading…" : "Submit for approval"}
      </button>
    </form>
  );
}
