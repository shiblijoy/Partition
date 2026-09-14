"use client";

import { useActionState, useState } from "react";
import type { FormState } from "./actions";

const initialState: FormState = {};

export function MarkSoldForm({
  action,
  suggested,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  suggested: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
      >
        Mark as sold
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-medium text-stone-700">Record this sale</p>
      <div>
        <label className="block text-xs font-medium text-stone-500">Buyer name</label>
        <input name="buyerName" required className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-stone-500">Buyer phone</label>
          <input name="buyerPhone" className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500">Buyer email</label>
          <input name="buyerEmail" type="email" className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">Sale price</label>
        <input
          name="salePrice"
          type="number"
          step="0.01"
          required
          defaultValue={suggested.toFixed(2)}
          className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Confirm sale"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
