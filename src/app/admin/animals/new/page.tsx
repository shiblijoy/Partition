"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createAnimal, type FormState } from "../actions";

const initialState: FormState = {};

export default function NewAnimalPage() {
  const [state, formAction, pending] = useActionState(createAnimal, initialState);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/admin/animals" className="text-sm text-stone-500 hover:text-emerald-700">
          ← Back to animals
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-stone-900">Add animal</h1>
      </div>

      <form action={formAction} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tag ID" name="tagId" required placeholder="e.g. COW-002" />
          <div>
            <label className="block text-sm font-medium text-stone-700">Species</label>
            <select
              name="species"
              required
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              <option value="COW">Cow</option>
              <option value="GOAT">Goat</option>
              <option value="LAMB">Lamb</option>
              <option value="CHICKEN">Chicken</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Breed" name="breed" />
          <div>
            <label className="block text-sm font-medium text-stone-700">Sex</label>
            <select name="sex" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm">
              <option value="">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date of birth" name="dob" type="date" />
          <Field
            label="Acquisition date"
            name="acquisitionDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Acquisition cost" name="acquisitionCost" type="number" step="0.01" defaultValue="0" />
          <Field label="Weight (kg)" name="weightKg" type="number" step="0.1" />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add animal"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  step?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        step={step}
        className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}
