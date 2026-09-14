"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { costToDate, suggestedPrice, DEFAULT_MARGIN_PERCENT } from "@/lib/cost";

export async function confirmOrder(orderId: string): Promise<void> {
  await requireSession();
  await prisma.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
  revalidatePath("/admin/orders");
}

export async function cancelOrder(orderId: string): Promise<void> {
  await requireSession();
  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  revalidatePath("/admin/orders");
}

export async function completeOrder(orderId: string): Promise<void> {
  await requireSession();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { animal: { include: { costEntries: true } } },
  });
  if (!order || order.animal.status === "SOLD") return;

  const setting = await prisma.priceSetting.findUnique({ where: { species: order.animal.species } });
  const price = suggestedPrice(order.animal, setting?.marginPercent ?? DEFAULT_MARGIN_PERCENT);
  const cost = costToDate(order.animal);

  await prisma.$transaction([
    prisma.saleRecord.create({
      data: {
        animalId: order.animalId,
        buyerName: order.buyerName,
        buyerPhone: order.buyerPhone,
        buyerEmail: order.buyerEmail,
        salePrice: price,
        costToDate: cost,
        profit: price - cost,
      },
    }),
    prisma.animal.update({
      where: { id: order.animalId },
      data: { status: "SOLD", forSale: false },
    }),
    prisma.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } }),
  ]);

  revalidatePath("/admin/orders");
  revalidatePath("/admin/animals");
}
