"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

const initialState: FormState = {};

export function CostEntryForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
      <div>
        <label className="block text-xs font-medium text-stone-500">Category</label>
        <select name="category" required className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm">
          <option value="FEED">Feed</option>
          <option value="MEDICAL">Medical</option>
          <option value="LABOR">Labor</option>
          <option value="HOUSING">Housing</option>
          <option value="TRANSPORT">Transport</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">Amount</label>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">Date</label>
        <input
          name="date"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label className="block text-xs font-medium text-stone-500">Note</label>
        <input name="note" type="text" className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add cost"}
      </button>
      {state.error && <p className="col-span-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
