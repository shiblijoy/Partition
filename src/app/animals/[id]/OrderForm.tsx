"use client";

import { useActionState } from "react";
import { createOrder, type OrderFormState } from "@/app/order/actions";

const initialState: OrderFormState = {};

export function OrderForm({ animalId }: { animalId: string }) {
  const boundAction = createOrder.bind(null, animalId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state.success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
        <p className="font-medium">Thanks! Your order request was sent.</p>
        <p className="mt-1 text-sm">We&apos;ll contact you shortly to confirm payment and pickup.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-700">Order this animal</h2>
      <div>
        <label className="block text-xs font-medium text-stone-500">Your name</label>
        <input name="buyerName" required className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">Phone number</label>
        <input name="buyerPhone" required className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">Email (optional)</label>
        <input name="buyerEmail" type="email" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500">Note (optional)</label>
        <textarea name="note" rows={2} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Request to buy"}
      </button>
      <p className="text-xs text-stone-400">
        This reserves the animal for you — we&apos;ll follow up to arrange payment (no online payment yet).
      </p>
    </form>
  );
}
