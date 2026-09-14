import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { suggestedPrice, currency } from "@/lib/cost";
import { SPECIES_EMOJI } from "@/components/Badge";

// Listings change whenever staff add, sell, or price animals — never cache this page.
export const dynamic = "force-dynamic";

export default async function StorefrontPage() {
  const [animals, settings] = await Promise.all([
    prisma.animal.findMany({
      where: { forSale: true, status: "FOR_SALE" },
      include: { costEntries: true, photos: { orderBy: { sortOrder: "asc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.priceSetting.findMany(),
  ]);
  const marginBySpecies = Object.fromEntries(settings.map((s) => [s.species, s.marginPercent]));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold text-emerald-700">🐄 Green Pastures Farm</span>
          <Link href="/login" className="text-sm text-stone-500 hover:text-emerald-700">
            Farm staff login
          </Link>
        </div>
      </header>

      <section className="bg-emerald-700 py-12 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="text-3xl font-semibold sm:text-4xl">Healthy animals, raised with care</h1>
          <p className="mt-2 max-w-xl text-emerald-100">
            Browse cows, goats, lambs, and chickens currently available. Place an order and we&apos;ll
            reach out to arrange payment and pickup.
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {animals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-400">
            Nothing is listed for sale right now — check back soon.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {animals.map((animal) => {
              const price = animal.listedPrice ?? suggestedPrice(animal, marginBySpecies[animal.species]);
              return (
                <Link
                  key={animal.id}
                  href={`/animals/${animal.id}`}
                  className="group overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:border-emerald-300 hover:shadow-sm"
                >
                  <div className="relative flex aspect-video items-center justify-center bg-stone-100">
                    {animal.photos[0] ? (
                      <Image
                        src={animal.photos[0].url}
                        alt={`${animal.breed ?? animal.species} ${animal.tagId}`}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-5xl">{SPECIES_EMOJI[animal.species] ?? "🐾"}</span>
                    )}
                  </div>
                  <div className="p-5">
                    <h2 className="text-lg font-semibold text-stone-900 group-hover:text-emerald-700">
                      {animal.breed ?? animal.species} · {animal.tagId}
                    </h2>
                    <p className="text-sm text-stone-500">
                      {animal.sex ?? "Unknown sex"} {animal.weightKg ? `· ${animal.weightKg} kg` : ""}
                    </p>
                    <p className="mt-3 text-xl font-semibold text-emerald-700">{currency(price)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-400">
        Green Pastures Farm — animal listings update in real time from our management system.
      </footer>
    </div>
  );
}
