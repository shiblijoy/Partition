"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type OrderFormState = { error?: string; success?: boolean };

export async function createOrder(
  animalId: string,
  _prev: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim();
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!buyerName) return { error: "Please enter your name." };
  if (!buyerPhone) return { error: "Please enter a phone number so we can reach you." };

  const animal = await prisma.animal.findUnique({ where: { id: animalId } });
  if (!animal || !animal.forSale || animal.status !== "FOR_SALE") {
    return { error: "Sorry, this animal is no longer available." };
  }

  await prisma.order.create({
    data: { animalId, buyerName, buyerPhone, buyerEmail, note },
  });

  revalidatePath(`/animals/${animalId}`);
  revalidatePath("/admin/orders");
  return { success: true };
}
