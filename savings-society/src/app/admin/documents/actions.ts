"use server";

import { revalidatePath } from "next/cache";
import { AssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

/** Uploads a document. Nothing is deleted: a new version replaces the old one, which stays in history. */
export async function uploadDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const asset = String(formData.get("asset") ?? "");
  const docType = String(formData.get("docType") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const replacesId = String(formData.get("replaces") ?? "") || null;
  const file = formData.get("file");

  // "asset" is an investment id, or SOCIETY / SHARES for papers not tied to one investment.
  let assetType: AssetType;
  let investmentId: string | null = null;
  if (asset === "SOCIETY" || asset === "SHARES") {
    assetType = asset;
  } else {
    const inv = await prisma.investment.findUnique({ where: { id: asset } });
    if (!inv) return { error: "Choose the asset." };
    assetType = inv.kind;
    investmentId = inv.id;
  }
  if (!docType || !title) return { error: "Choose the document type and give it a title." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };

  let filePath: string;
  try {
    filePath = await saveFile("documents", file, 20 * 1024 * 1024);
  } catch (err) {
    if (err instanceof UploadError) return { error: err.message };
    throw err;
  }

  const old = replacesId ? await prisma.document.findUnique({ where: { id: replacesId } }) : null;
  const doc = await prisma.document.create({
    data: { assetType, investmentId, docType, title, filePath, version: old ? old.version + 1 : 1 },
  });
  if (old) await prisma.document.update({ where: { id: old.id }, data: { replacedById: doc.id } });
  await audit(admin.userId, "document.uploaded", `${admin.name} uploaded “${title}”${old ? ` (v${doc.version}, replaces v${old.version})` : ""}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");

  return {
    ok: "Uploaded. Every member can view it in the app.",
    ...(formData.get("whatsapp") === "on"
      ? { link: { href: `https://wa.me/?text=${encodeURIComponent(`${settings.societyName}: new document uploaded — ${title}. View it under Asset documents in the app.`)}`, label: "Tell members on WhatsApp" } }
      : {}),
  };
}
