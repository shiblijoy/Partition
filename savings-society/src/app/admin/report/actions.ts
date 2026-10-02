"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";

/** Posts a report summary on the notice board so every member sees it. */
export async function shareReport(title: string, body: string): Promise<void> {
  const admin = await requireAdmin();
  await prisma.notice.create({ data: { kind: "GENERAL", title, body } });
  await audit(admin.userId, "report.shared", `${admin.name} shared “${title}” with members`);
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}
