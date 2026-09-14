"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { Species } from "@prisma/client";

export async function updateMargins(formData: FormData): Promise<void> {
  await requireSession();

  await Promise.all(
    Object.values(Species).map(async (species) => {
      const raw = formData.get(`margin_${species}`);
      if (raw == null) return;
      const marginPercent = Number(raw);
      if (Number.isNaN(marginPercent)) return;
      await prisma.priceSetting.upsert({
        where: { species },
        update: { marginPercent },
        create: { species, marginPercent },
      });
    })
  );

  revalidatePath("/admin/settings");
  revalidatePath("/admin/animals");
}
