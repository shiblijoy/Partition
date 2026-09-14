import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  costToDate,
  averageDailyCost,
  suggestedPrice,
  daysOnFarm,
  currency,
  DEFAULT_MARGIN_PERCENT,
} from "@/lib/cost";
import { Badge, SPECIES_EMOJI } from "@/components/Badge";
import { addCostEntry, deleteCostEntry, updatePricing, markSold, deleteAnimal, addPhotos, deletePhoto } from "./actions";
import { CostEntryForm } from "./CostEntryForm";
import { PricingForm } from "./PricingForm";
import { MarkSoldForm } from "./MarkSoldForm";
import { DeleteButton } from "./DeleteButton";
import { PhotoPanel } from "./PhotoPanel";

export default async function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const animal = await prisma.animal.findUnique({
    where: { id },
    include: {
      costEntries: { orderBy: { date: "desc" } },
      photos: { orderBy: { sortOrder: "asc" } },
      sale: true,
    },
  });
  if (!animal) notFound();

  const setting = await prisma.priceSetting.findUnique({ where: { species: animal.species } });
  const defaultMargin = setting?.marginPercent ?? DEFAULT_MARGIN_PERCENT;

  const cost = costToDate(animal);
  const daily = averageDailyCost(animal);
  const suggested = suggestedPrice(animal, defaultMargin);
  const age = daysOnFarm(animal);

  const boundAddCost = addCostEntry.bind(null, animal.id);
  const boundDeleteCost = deleteCostEntry.bind(null, animal.id);
  const boundUpdatePricing = updatePricing.bind(null, animal.id);
  const boundMarkSold = markSold.bind(null, animal.id);
  const boundDeleteAnimal = deleteAnimal.bind(null, animal.id);
  const boundAddPhotos = addPhotos.bind(null, animal.id);
  const boundDeletePhoto = deletePhoto.bind(null, animal.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/animals" className="text-sm text-stone-500 hover:text-emerald-700">
            ← Back to animals
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">
            {SPECIES_EMOJI[animal.species]} {animal.tagId}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-stone-500">
            <Badge label={animal.status} />
            <span>{animal.breed ?? animal.species}</span>
            {animal.sex && <span>· {animal.sex}</span>}
          </div>
        </div>
        {animal.status !== "SOLD" && (
          <DeleteButton
            action={boundDeleteAnimal}
            confirmText={`Delete ${animal.tagId}? This removes its cost history too.`}
            className="text-sm text-stone-400 hover:text-red-600"
          >
            Delete animal
          </DeleteButton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Days on farm" value={String(age)} />
        <Stat label="Cost to date" value={currency(cost)} />
        <Stat label="Avg. daily cost" value={currency(daily)} />
        <Stat label="Suggested price" value={currency(suggested)} accent />
      </div>

      {animal.sale && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Sold to <strong>{animal.sale.buyerName}</strong> for {currency(animal.sale.salePrice)} on{" "}
          {animal.sale.saleDate.toLocaleDateString()}. Cost at sale was {currency(animal.sale.costToDate)}, profit{" "}
          {currency(animal.sale.profit)}.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-stone-700">Cost ledger</h2>
          <div className="mt-3">
            <CostEntryForm action={boundAddCost} />
          </div>
          <div className="mt-4 divide-y divide-stone-100">
            <div className="grid grid-cols-4 gap-2 pb-2 text-xs font-medium uppercase text-stone-400">
              <span>Date</span>
              <span>Category</span>
              <span>Note</span>
              <span className="text-right">Amount</span>
            </div>
            {animal.costEntries.map((entry) => (
              <div key={entry.id} className="grid grid-cols-4 items-center gap-2 py-2 text-sm">
                <span className="text-stone-600">{entry.date.toLocaleDateString()}</span>
                <span className="text-stone-600">{entry.category}</span>
                <span className="truncate text-stone-500">{entry.note ?? "—"}</span>
                <span className="flex items-center justify-end gap-2 font-medium text-stone-800">
                  {currency(entry.amount)}
                  <DeleteButton
                    action={boundDeleteCost.bind(null, entry.id)}
                    confirmText="Remove this cost entry?"
                    className="text-xs text-stone-400 hover:text-red-600"
                  >
                    ✕
                  </DeleteButton>
                </span>
              </div>
            ))}
            {animal.costEntries.length === 0 && (
              <p className="py-4 text-sm text-stone-400">No cost entries logged yet.</p>
            )}
          </div>
          <div className="mt-3 flex justify-between border-t border-stone-200 pt-3 text-sm">
            <span className="text-stone-500">Acquisition cost</span>
            <span className="font-medium text-stone-700">{currency(animal.acquisitionCost)}</span>
          </div>
        </section>

        <div className="space-y-6">
          <PhotoPanel photos={animal.photos} addAction={boundAddPhotos} deleteAction={boundDeletePhoto} />

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-700">Pricing &amp; sale</h2>
            <p className="mt-1 text-xs text-stone-500">
              Suggested price = cost to date × (1 + margin). Species default margin is {defaultMargin}%.
            </p>
            <div className="mt-4">
              <PricingForm
                action={boundUpdatePricing}
                defaultMargin={defaultMargin}
                currentMargin={animal.marginPercent}
                currentListedPrice={animal.listedPrice}
                currentForSale={animal.forSale}
              />
            </div>
            {animal.status !== "SOLD" && (
              <div className="mt-4 border-t border-stone-100 pt-4">
                <MarkSoldForm action={boundMarkSold} suggested={suggested} />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600">
            <h2 className="mb-2 text-sm font-semibold text-stone-700">Profile</h2>
            <dl className="space-y-1">
              <Row label="DOB" value={animal.dob ? animal.dob.toLocaleDateString() : "Unknown"} />
              <Row label="Acquired" value={animal.acquisitionDate.toLocaleDateString()} />
              <Row label="Weight" value={animal.weightKg ? `${animal.weightKg} kg` : "—"} />
              <Row label="Notes" value={animal.notes ?? "—"} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-emerald-700" : "text-stone-900"}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-stone-400">{label}</dt>
      <dd className="text-right text-stone-700">{value}</dd>
    </div>
  );
}
