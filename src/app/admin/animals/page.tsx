import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { costToDate, suggestedPrice, currency } from "@/lib/cost";
import { Badge, SPECIES_EMOJI } from "@/components/Badge";
import type { Prisma, Species, AnimalStatus } from "@prisma/client";

const SPECIES_OPTIONS = ["COW", "GOAT", "LAMB", "CHICKEN", "OTHER"];
const STATUS_OPTIONS = ["ACTIVE", "FOR_SALE", "SOLD", "DECEASED"];

export default async function AnimalsPage({
  searchParams,
}: {
  searchParams: Promise<{ species?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;

  const where: Prisma.AnimalWhereInput = {};
  if (params.species) where.species = params.species as Species;
  if (params.status) where.status = params.status as AnimalStatus;
  if (params.q) where.tagId = { contains: params.q };

  const [animals, settings] = await Promise.all([
    prisma.animal.findMany({
      where,
      include: { costEntries: true, photos: { orderBy: { sortOrder: "asc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.priceSetting.findMany(),
  ]);
  const marginBySpecies = Object.fromEntries(settings.map((s) => [s.species, s.marginPercent]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Animals</h1>
        <Link
          href="/admin/animals/new"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Add animal
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-stone-500">Search tag</label>
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="e.g. COW-001"
            className="mt-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500">Species</label>
          <select
            name="species"
            defaultValue={params.species ?? ""}
            className="mt-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {SPECIES_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500">Status</label>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="mt-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded-md border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Animal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Cost to date</th>
              <th className="px-4 py-3">Suggested price</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {animals.map((animal) => (
              <tr key={animal.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-stone-100">
                      {animal.photos[0] ? (
                        <Image src={animal.photos[0].url} alt="" fill sizes="40px" className="object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-lg">
                          {SPECIES_EMOJI[animal.species]}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-stone-900">{animal.tagId}</div>
                      <div className="text-xs text-stone-500">
                        {animal.breed ?? animal.species} {animal.sex ? `· ${animal.sex}` : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge label={animal.forSale ? "FOR_SALE" : animal.status} />
                </td>
                <td className="px-4 py-3 text-stone-700">{currency(costToDate(animal))}</td>
                <td className="px-4 py-3 font-medium text-emerald-700">
                  {currency(suggestedPrice(animal, marginBySpecies[animal.species]))}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/animals/${animal.id}`} className="text-sm font-medium text-emerald-700 hover:underline">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {animals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-stone-400">
                  No animals match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
