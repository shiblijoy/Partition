"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/components/ActionForm";
import { primaryButton } from "@/components/ui";

type Row = { id: string; name: string; calculated: number };

/** FR-REC-02/03: actual vs calculated balance per account; a month can't close until each difference is explained. */
export function ReconcileForm({ action, accounts, currency, monthName }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; accounts: Row[]; currency: string; monthName: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState<string[]>(accounts.map(() => ""));
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const fmt = (n: number) => `${n < 0 ? "− " : ""}${currency} ${new Intl.NumberFormat("en-IN").format(Math.round(Math.abs(n)))}`;
  const complete = values.every((v) => v !== "");

  if (state.ok) return <p className="rounded-xl bg-good-bg px-4 py-3 text-sm font-semibold text-good">{state.ok}</p>;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold text-muted">
              <th className="px-4 py-2.5 sm:px-2">Account</th>
              <th className="px-2 py-2.5">Books say</th>
              <th className="px-2 py-2.5">Actual (statement)</th>
              <th className="px-2 py-2.5">Difference</th>
              <th className="px-2 py-2.5">Statement</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => {
              const diff = values[i] === "" ? null : Math.round(Number(values[i]) - a.calculated);
              const fix = fixes[a.id] ?? (diff != null && diff < 0 ? "charge" : "note");
              return (
                <tr key={a.id} className="border-b border-[#EFEDE6] align-top">
                  <td className="px-4 py-3 font-bold sm:px-2">{a.name}<input type="hidden" name="accountId" value={a.id} /></td>
                  <td className="px-2 py-3">{fmt(a.calculated)}</td>
                  <td className="px-2 py-3">
                    <input name="actual" type="number" step="1" required aria-label={`${a.name} closing balance`} value={values[i]} onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))} className="h-11 w-40 rounded-xl border border-field bg-white px-3 text-[15px]" />
                  </td>
                  <td className="px-2 py-3">
                    {diff == null ? null : diff === 0 ? (
                      <span className="font-bold text-good">None</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <span className="font-bold text-bad">{fmt(diff)}</span>
                        <select name={`fix-${a.id}`} value={fix} onChange={(e) => setFixes({ ...fixes, [a.id]: e.target.value })} aria-label="How to explain it" className="h-9 rounded-lg border border-field px-1 text-[13px]">
                          {diff < 0 && <option value="charge">Add {fmt(-diff)} bank charge</option>}
                          {diff > 0 && <option value="interest">Add {fmt(diff)} bank interest</option>}
                          <option value="note">Explain with a note</option>
                        </select>
                        {fix === "note" && <input name={`note-${a.id}`} required aria-label="Note" placeholder="e.g. deposit that arrived on the 1st" className="h-9 w-56 rounded-lg border border-field px-2 text-[13px]" />}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <input name="statement" type="file" aria-label={`${a.name} statement`} accept="image/jpeg,image/png,image/webp,application/pdf" className="w-44 text-xs text-muted file:mr-2 file:h-9 file:rounded-lg file:border-0 file:bg-paper file:px-3 file:font-bold" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Missing an entry? Record it first (dated in {monthName}), then come back. A correcting entry is booked on the last day of the month.</p>
      {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{state.error}</p>}
      <button disabled={pending || !complete} className={`self-start ${primaryButton}`}>Close and lock {monthName}</button>
    </form>
  );
}
