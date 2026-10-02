"use server";

import { revalidatePath } from "next/cache";
import { NoticeKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { fmtDateTime } from "@/lib/format";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

export async function postNotice(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const kind = String(formData.get("kind") ?? "") as NoticeKind;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const when = String(formData.get("eventAt") ?? "");
  const place = String(formData.get("place") ?? "").trim() || null;
  const file = formData.get("attachment");

  if (!Object.values(NoticeKind).includes(kind)) return { error: "Choose a type." };
  if (!title || !body) return { error: "Add a title and a message." };
  if (kind === "MEETING" && !when) return { error: "Add the meeting date and time." };

  let attachmentPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      attachmentPath = await saveFile("notices", file);
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message };
      throw err;
    }
  }
  const eventAt = when ? new Date(when) : null;
  await prisma.notice.create({ data: { kind, title, body, eventAt, place, attachmentPath } });
  await audit(admin.userId, "notice.posted", `${admin.name} posted “${title}”`);
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");

  const text = [`*${settings.societyName}: ${title}*`, eventAt ? `${fmtDateTime(eventAt)}${place ? `, ${place}` : ""}` : "", body, "Details in the app."].filter(Boolean).join("\n");
  return {
    ok: "Posted to all members.",
    ...(formData.get("whatsapp") === "on" ? { link: { href: `https://wa.me/?text=${encodeURIComponent(text)}`, label: "Share on WhatsApp (pick the society group)" } } : {}),
  };
}

export async function deleteNotice(id: string): Promise<void> {
  const admin = await requireAdmin();
  const n = await prisma.notice.delete({ where: { id } });
  await audit(admin.userId, "notice.deleted", `${admin.name} deleted the notice “${n.title}”`);
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
}
