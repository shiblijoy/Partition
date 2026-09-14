"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { costToDate } from "@/lib/cost";
import { CostCategory } from "@prisma/client";

export type FormState = { error?: string };

export async function addCostEntry(
  animalId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireSession();

  const category = String(formData.get("category") ?? "") as CostCategory;
  const amount = Number(formData.get("amount"));
  const dateRaw = String(formData.get("date") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!Object.values(CostCategory).includes(category)) return { error: "Choose a category." };
  if (Number.isNaN(amount) || amount <= 0) return { error: "Amount must be a positive number." };

  await prisma.costEntry.create({
    data: {
      animalId,
      category,
      amount,
      date: dateRaw ? new Date(dateRaw) : new Date(),
      note,
    },
  });

  revalidatePath(`/admin/animals/${animalId}`);
  return {};
}

export async function deleteCostEntry(animalId: string, entryId: string): Promise<void> {
  await requireSession();
  await prisma.costEntry.delete({ where: { id: entryId } });
  revalidatePath(`/admin/animals/${animalId}`);
}

export async function updatePricing(
  animalId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireSession();

  const marginRaw = String(formData.get("marginPercent") ?? "").trim();
  const listedRaw = String(formData.get("listedPrice") ?? "").trim();
  const forSale = formData.get("forSale") === "on";

  await prisma.animal.update({
    where: { id: animalId },
    data: {
      marginPercent: marginRaw ? Number(marginRaw) : null,
      listedPrice: listedRaw ? Number(listedRaw) : null,
      forSale,
      status: forSale ? "FOR_SALE" : "ACTIVE",
    },
  });

  revalidatePath(`/admin/animals/${animalId}`);
  revalidatePath("/admin/animals");
  return {};
}

export async function markSold(
  animalId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireSession();

  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim() || null;
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim() || null;
  const salePrice = Number(formData.get("salePrice"));

  if (!buyerName) return { error: "Buyer name is required." };
  if (Number.isNaN(salePrice) || salePrice <= 0) return { error: "Sale price must be positive." };

  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    include: { costEntries: true },
  });
  if (!animal) return { error: "Animal not found." };

  const cost = costToDate(animal);

  await prisma.$transaction([
    prisma.saleRecord.create({
      data: {
        animalId,
        buyerName,
        buyerPhone,
        buyerEmail,
        salePrice,
        costToDate: cost,
        profit: salePrice - cost,
      },
    }),
    prisma.animal.update({
      where: { id: animalId },
      data: { status: "SOLD", forSale: false },
    }),
  ]);

  revalidatePath(`/admin/animals/${animalId}`);
  revalidatePath("/admin/animals");
  redirect(`/admin/animals/${animalId}`);
}

export async function deleteAnimal(animalId: string): Promise<void> {
  await requireSession();
  await prisma.animal.delete({ where: { id: animalId } });
  revalidatePath("/admin/animals");
  redirect("/admin/animals");
}
