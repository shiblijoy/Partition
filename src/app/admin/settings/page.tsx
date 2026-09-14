import { prisma } from "@/lib/prisma";
import { Species } from "@prisma/client";
import { DEFAULT_MARGIN_PERCENT } from "@/lib/cost";
import { SPECIES_EMOJI } from "@/components/Badge";
import { updateMargins } from "./actions";

export default async function SettingsPage() {
  const settings = await prisma.priceSetting.findMany();
  const marginBySpecies = Object.fromEntries(settings.map((s) => [s.species, s.marginPercent]));

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Pricing settings</h1>
        <p className="text-sm text-stone-500">
          Default markup applied on top of cost-to-date when suggesting a selling price. Any animal
          can override this individually.
        </p>
      </div>

      <form action={updateMargins} className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        {Object.values(Species).map((species) => (
          <div key={species} className="flex items-center justify-between gap-4">
            <label htmlFor={`margin_${species}`} className="text-sm text-stone-700">
              {SPECIES_EMOJI[species]} {species}
            </label>
            <div className="flex items-center gap-1">
              <input
                id={`margin_${species}`}
                name={`margin_${species}`}
                type="number"
                step="0.1"
                defaultValue={marginBySpecies[species] ?? DEFAULT_MARGIN_PERCENT}
                className="w-24 rounded-md border border-stone-300 px-2 py-1.5 text-right text-sm"
              />
              <span className="text-sm text-stone-500">%</span>
            </div>
          </div>
        ))}
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Save margins
        </button>
      </form>
    </div>
  );
}
