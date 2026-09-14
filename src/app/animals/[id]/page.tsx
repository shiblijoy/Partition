import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { suggestedPrice, currency } from "@/lib/cost";
import { SPECIES_EMOJI } from "@/components/Badge";
import { OrderForm } from "./OrderForm";
import { PhotoGallery } from "./PhotoGallery";

export default async function PublicAnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const animal = await prisma.animal.findUnique({
    where: { id },
    include: { costEntries: true, photos: { orderBy: { sortOrder: "asc" } } },
  });
  if (!animal || !animal.forSale || animal.status !== "FOR_SALE") notFound();

  const setting = await prisma.priceSetting.findUnique({ where: { species: animal.species } });
  const price = animal.listedPrice ?? suggestedPrice(animal, setting?.marginPercent);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Link href="/" className="text-sm text-stone-500 hover:text-emerald-700">
            ← Back to all animals
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-4xl flex-1 gap-8 px-4 py-8 sm:grid-cols-2">
        <div>
          <PhotoGallery
            photos={animal.photos}
            fallbackEmoji={SPECIES_EMOJI[animal.species] ?? "🐾"}
            alt={`${animal.breed ?? animal.species} ${animal.tagId}`}
          />
          <h1 className="mt-3 text-2xl font-semibold text-stone-900">
            {animal.breed ?? animal.species} · {animal.tagId}
          </h1>
          <p className="text-stone-500">{animal.sex ?? "Sex unknown"}</p>
          <p className="mt-4 text-3xl font-semibold text-emerald-700">{currency(price)}</p>

          <dl className="mt-6 space-y-1 text-sm">
            {animal.weightKg && (
              <div className="flex justify-between">
                <dt className="text-stone-400">Weight</dt>
                <dd className="text-stone-700">{animal.weightKg} kg</dd>
              </div>
            )}
            {animal.dob && (
              <div className="flex justify-between">
                <dt className="text-stone-400">Date of birth</dt>
                <dd className="text-stone-700">{animal.dob.toLocaleDateString()}</dd>
              </div>
            )}
          </dl>

          {animal.notes && <p className="mt-4 text-sm text-stone-600">{animal.notes}</p>}
        </div>

        <OrderForm animalId={animal.id} />
      </main>
    </div>
  );
}
