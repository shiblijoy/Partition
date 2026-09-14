"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { Species, Sex } from "@prisma/client";

export type FormState = { error?: string };

export async function createAnimal(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();

  const tagId = String(formData.get("tagId") ?? "").trim();
  const species = String(formData.get("species") ?? "") as Species;
  const breed = String(formData.get("breed") ?? "").trim() || null;
  const sexRaw = String(formData.get("sex") ?? "");
  const sex = (sexRaw as Sex) || null;
  const dobRaw = String(formData.get("dob") ?? "");
  const acquisitionDateRaw = String(formData.get("acquisitionDate") ?? "");
  const acquisitionCost = Number(formData.get("acquisitionCost") ?? 0);
  const weightKg = formData.get("weightKg") ? Number(formData.get("weightKg")) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!tagId) return { error: "Tag ID is required." };
  if (!Object.values(Species).includes(species)) return { error: "Choose a species." };
  if (Number.isNaN(acquisitionCost) || acquisitionCost < 0) {
    return { error: "Acquisition cost must be a positive number." };
  }

  const existing = await prisma.animal.findUnique({ where: { tagId } });
  if (existing) return { error: `Tag "${tagId}" is already in use.` };

  const animal = await prisma.animal.create({
    data: {
      tagId,
      species,
      breed,
      sex,
      dob: dobRaw ? new Date(dobRaw) : null,
      acquisitionDate: acquisitionDateRaw ? new Date(acquisitionDateRaw) : new Date(),
      acquisitionCost,
      weightKg,
      notes,
    },
  });

  revalidatePath("/admin/animals");
  redirect(`/admin/animals/${animal.id}`);
}
