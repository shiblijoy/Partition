"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { CostCategory } from "@prisma/client";
import { randomUUID } from "crypto";

export type FormState = { error?: string; success?: string };

export async function logBulkCost(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();

  const animalIds = formData.getAll("animalIds").map(String);
  const category = String(formData.get("category") ?? "") as CostCategory;
  const dateRaw = String(formData.get("date") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const mode = String(formData.get("mode") ?? "each");
  const amount = Number(formData.get("amount"));

  if (animalIds.length === 0) return { error: "Select at least one animal." };
  if (!Object.values(CostCategory).includes(category)) return { error: "Choose a category." };
  if (Number.isNaN(amount) || amount <= 0) return { error: "Amount must be a positive number." };

  const perAnimalAmount = mode === "split" ? amount / animalIds.length : amount;
  const date = dateRaw ? new Date(dateRaw) : new Date();
  const batchId = randomUUID();

  await prisma.costEntry.createMany({
    data: animalIds.map((animalId) => ({
      animalId,
      category,
      amount: perAnimalAmount,
      date,
      note,
      batchId,
    })),
  });

  revalidatePath("/admin/costs");
  revalidatePath("/admin/animals");
  return { success: `Logged cost for ${animalIds.length} animal(s).` };
}
