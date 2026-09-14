import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { costToDate, currency } from "@/lib/cost";
import { SPECIES_EMOJI } from "@/components/Badge";

export default async function AdminDashboard() {
  const [animals, pendingOrders, monthCosts] = await Promise.all([
    prisma.animal.findMany({ include: { costEntries: true } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.costEntry.aggregate({
      _sum: { amount: true },
      where: { date: { gte: new Date(new Date().setDate(1)) } },
    }),
  ]);

  const bySpecies = animals.reduce<Record<string, number>>((acc, a) => {
    acc[a.species] = (acc[a.species] ?? 0) + 1;
    return acc;
  }, {});

  const active = animals.filter((a) => a.status !== "SOLD" && a.status !== "DECEASED");
  const forSale = animals.filter((a) => a.forSale && a.status !== "SOLD");
  const totalCostToDate = active.reduce((sum, a) => sum + costToDate(a), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
        <p className="text-sm text-stone-500">A snapshot of your farm right now.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active animals" value={String(active.length)} />
        <StatCard label="Listed for sale" value={String(forSale.length)} />
        <StatCard label="Pending orders" value={String(pendingOrders)} accent={pendingOrders > 0} />
        <StatCard label="Cost this month" value={currency(monthCosts._sum.amount ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-700">Animals by species</h2>
          <ul className="mt-3 space-y-2">
            {Object.entries(bySpecies).length === 0 && (
              <li className="text-sm text-stone-400">No animals yet.</li>
            )}
            {Object.entries(bySpecies).map(([species, count]) => (
              <li key={species} className="flex items-center justify-between text-sm">
                <span>
                  {SPECIES_EMOJI[species] ?? "🐾"} {species}
                </span>
                <span className="font-medium text-stone-700">{count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-700">Total invested (active animals)</h2>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">{currency(totalCostToDate)}</p>
          <p className="mt-1 text-sm text-stone-500">
            Sum of acquisition cost + logged daily costs across every animal not yet sold.
          </p>
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/animals/new"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Add animal
        </Link>
        <Link
          href="/admin/costs"
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Log daily costs
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Review orders
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-amber-600" : "text-stone-900"}`}>
        {value}
      </p>
    </div>
  );
}
