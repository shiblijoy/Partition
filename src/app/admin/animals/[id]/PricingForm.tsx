"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

const initialState: FormState = {};

export function PricingForm({
  action,
  defaultMargin,
  currentMargin,
  currentListedPrice,
  currentForSale,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultMargin: number;
  currentMargin: number | null;
  currentListedPrice: number | null;
  currentForSale: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-stone-500">
          Margin % (blank = species default of {defaultMargin}%)
        </label>
        <input
          name="marginPercent"
          type="number"
          step="0.1"
          defaultValue={currentMargin ?? ""}
          className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">
          Manual price override (blank = use suggested price)
        </label>
        <input
          name="listedPrice"
          type="number"
          step="0.01"
          defaultValue={currentListedPrice ?? ""}
          className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" name="forSale" defaultChecked={currentForSale} className="rounded border-stone-300" />
        List publicly for sale
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save pricing"}
      </button>
    </form>
  );
}
