import { prisma } from "@/lib/prisma";
import { BulkCostForm } from "./BulkCostForm";

export default async function CostsPage() {
  const animals = await prisma.animal.findMany({
    where: { status: { notIn: ["SOLD", "DECEASED"] } },
    select: { id: true, tagId: true, species: true },
    orderBy: [{ species: "asc" }, { tagId: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Log daily costs</h1>
        <p className="text-sm text-stone-500">
          Record feed, medical, labor, or other costs for one animal or a whole group at once.
        </p>
      </div>
      <BulkCostForm animals={animals} />
    </div>
  );
}
