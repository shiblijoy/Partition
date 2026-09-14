"use client";

import { useActionState, useMemo, useState } from "react";
import { logBulkCost, type FormState } from "./actions";
import { SPECIES_EMOJI } from "@/components/Badge";

const initialState: FormState = {};

type AnimalOption = { id: string; tagId: string; species: string };

export function BulkCostForm({ animals }: { animals: AnimalOption[] }) {
  const [state, formAction, pending] = useActionState(logBulkCost, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"each" | "split">("each");

  const species = useMemo(() => Array.from(new Set(animals.map((a) => a.species))), [animals]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectSpecies(sp: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const idsForSpecies = animals.filter((a) => a.species === sp).map((a) => a.id);
      const allSelected = idsForSpecies.every((id) => next.has(id));
      idsForSpecies.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <label className="block text-xs font-medium text-stone-500">Date</label>
          <input
            name="date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500">
            {mode === "split" ? "Total amount to split" : "Amount per animal"}
          </label>
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
          <label className="block text-xs font-medium text-stone-500">Apply as</label>
          <select
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "each" | "split")}
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="each">Same amount each</option>
            <option value="split">Split total evenly</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-stone-500">Note</label>
        <input name="note" type="text" className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-stone-500">
            Animals ({selected.size} selected)
          </span>
          <div className="flex flex-wrap gap-2">
            {species.map((sp) => (
              <button
                type="button"
                key={sp}
                onClick={() => selectSpecies(sp)}
                className="rounded-full border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
              >
                {SPECIES_EMOJI[sp] ?? "🐾"} Toggle all {sp.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-stone-100 p-3 sm:grid-cols-3">
          {animals.map((animal) => (
            <label key={animal.id} className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                name="animalIds"
                value={animal.id}
                checked={selected.has(animal.id)}
                onChange={() => toggle(animal.id)}
                className="rounded border-stone-300"
              />
              {SPECIES_EMOJI[animal.species] ?? "🐾"} {animal.tagId}
            </label>
          ))}
          {animals.length === 0 && <p className="text-sm text-stone-400">No active animals.</p>}
        </div>
      </div>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending || selected.size === 0}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Logging…" : "Log cost"}
      </button>
    </form>
  );
}
