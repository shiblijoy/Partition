"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/components/ActionForm";
import { primaryButton, textareaClass } from "@/components/ui";

export function ReconcileForm({
  action,
  accounts,
  appBalance,
  currency,
  monthName,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  accounts: string[];
  appBalance: number;
  currency: string;
  monthName: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState<string[]>(accounts.map(() => ""));
  const [fix, setFix] = useState<"charge" | "note">("charge");
  const fmt = (n: number) => `${n < 0 ? "− " : ""}${currency} ${new Intl.NumberFormat("en-IN").format(Math.round(Math.abs(n)))}`;
  const complete = values.every((v) => v !== "");
  const total = values.reduce((s, v) => s + (Number(v) || 0), 0);
  const diff = Math.round((total - appBalance) * 100) / 100;

  if (state.ok) return <p className="rounded-xl bg-good-bg px-4 py-3 text-sm font-semibold text-good">{state.ok}</p>;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold text-muted">
              <th className="px-4 py-2.5 sm:px-2">Account</th>
              <th className="px-2 py-2.5">Actual closing balance (statement)</th>
              <th className="px-2 py-2.5">Statement</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={a} className="border-b border-[#EFEDE6]">
                <td className="px-4 py-3 font-bold sm:px-2">
                  {a}
                  <input type="hidden" name="account" value={a} />
                </td>
                <td className="px-2 py-3">
                  <input
                    name="actual"
                    type="number"
                    step="any"
                    required
                    aria-label={`${a} closing balance`}
                    value={values[i]}
                    onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
                    className="h-11 w-48 rounded-xl border border-field bg-white px-3 text-[15px]"
                  />
                </td>
                <td className="px-2 py-3">
                  <input name="statement" type="file" aria-label={`${a} statement`} accept="image/jpeg,image/png,image/webp,application/pdf" className="text-xs text-muted file:mr-2 file:h-9 file:rounded-lg file:border-0 file:bg-paper file:px-3 file:font-bold" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-extrabold">
              <td className="px-4 py-3 sm:px-2">Total cash</td>
              <td className="px-2 py-3">{fmt(total)} <span className="font-semibold text-muted">· books say {fmt(appBalance)}</span></td>
              <td className={`px-2 py-3 ${diff === 0 ? "text-good" : "text-bad"}`}>{complete ? (diff === 0 ? "No difference" : `Difference ${fmt(diff)}`) : ""}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {complete && diff !== 0 && (
        <fieldset className="flex flex-col gap-2 rounded-xl bg-bad-bg/60 p-4">
          <legend className="sr-only">Explain the difference</legend>
          <p className="text-sm font-bold text-bad">
            The accounts are {fmt(Math.abs(diff))} {diff < 0 ? "lower" : "higher"} than the books. Explain it before closing:
          </p>
          {diff < 0 && (
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input type="radio" name="fix" value="charge" checked={fix === "charge"} onChange={() => setFix("charge")} className="h-5 w-5 accent-brand" />
              Add {fmt(-diff)} bank charge (expense)
            </label>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input type="radio" name="fix" value="note" checked={fix === "note" || diff > 0} onChange={() => setFix("note")} className="h-5 w-5 accent-brand" />
            Add a note (e.g. a deposit that arrived on the 1st)
          </label>
          {(fix === "note" || diff > 0) && <textarea name="note" required rows={2} aria-label="Note" className={textareaClass} />}
          <p className="text-xs text-muted">Missing an entry? Record it first (dated in {monthName}), then come back.</p>
        </fieldset>
      )}

      {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{state.error}</p>}
      <button disabled={pending || !complete} className={`self-start ${primaryButton}`}>Close and lock {monthName}</button>
    </form>
  );
}
