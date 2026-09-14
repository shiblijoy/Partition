import type { Animal, CostEntry } from "@prisma/client";

export const DEFAULT_MARGIN_PERCENT = 25;

type AnimalWithCosts = Animal & { costEntries: CostEntry[] };

/** Total money spent on this animal so far: what it cost to acquire plus every logged cost entry. */
export function costToDate(animal: AnimalWithCosts): number {
  const logged = animal.costEntries.reduce((sum, entry) => sum + entry.amount, 0);
  return animal.acquisitionCost + logged;
}

/** Days the animal has been on the farm, used to show a daily-cost run rate. */
export function daysOnFarm(animal: Animal): number {
  const start = animal.acquisitionDate.getTime();
  const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
  return Math.max(days, 1);
}

export function averageDailyCost(animal: AnimalWithCosts): number {
  return costToDate(animal) / daysOnFarm(animal);
}

/**
 * Suggested selling price = cost-to-date marked up by a margin.
 * A manual listedPrice always wins; otherwise per-animal marginPercent,
 * falling back to the species default, falling back to the global default.
 */
export function suggestedPrice(
  animal: AnimalWithCosts,
  speciesMarginPercent?: number
): number {
  if (animal.listedPrice != null) return animal.listedPrice;
  const margin =
    animal.marginPercent ?? speciesMarginPercent ?? DEFAULT_MARGIN_PERCENT;
  return costToDate(animal) * (1 + margin / 100);
}

export function currency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}
