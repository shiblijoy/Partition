"use server";

import { NoticeKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { attempt, changed, text } from "@/lib/actions";
import { queueForAll } from "@/lib/notify";
import { CURRENT_MEMBER } from "@/lib/society";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

/** FR-NB-01/02: a notice with title, text, optional file and meeting date/place; every member is notified. */
export async function postNotice(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const kind = String(formData.get("kind") ?? "") as NoticeKind;
    const title = text(formData, "title") ?? "";
    const body = text(formData, "body") ?? "";
    const when = String(formData.get("eventAt") ?? "");
    const place = text(formData, "place");
    const investmentId = text(formData, "investmentId");
    if (!Object.values(NoticeKind).includes(kind)) return { error: "Choose a type." };
    if (!title || !body) return { error: "Add a title and a message." };
    if (kind === "MEETING" && !when) return { error: "Add the meeting date and time." };
    let attachmentPath: string | null = null;
    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      try {
        attachmentPath = await saveFile("notices", file);
      } catch (err) {
        if (err instanceof UploadError) return { error: err.message };
        throw err;
      }
    }
    const eventAt = when ? new Date(when) : null;
    const notice = await prisma.notice.create({ data: { kind, title, body, eventAt, place, attachmentPath, investmentId } });
    const members = (await prisma.user.findMany({ where: { role: "MEMBER", ...CURRENT_MEMBER }, select: { id: true } })).map((m) => m.id);
    await queueForAll(prisma, members, { kind: "notice", title: kind === "MEETING" ? "Meeting notice" : "New notice", body: title, url: "/member/notices" });
    await audit(admin.userId, "notice.posted", `${admin.name} posted “${title}”`, { entity: `notice:${notice.id}` });
    changed();
    return { ok: "Posted. Every member gets a notification in the app, with sound on their phone." };
  });
}

/** FR-NB-03: meeting minutes and decisions, added after the meeting. */
export async function saveMinutes(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const minutes = text(formData, "minutes");
    const n = await prisma.notice.update({ where: { id }, data: { minutes, investmentId: text(formData, "investmentId") } });
    await audit(admin.userId, "notice.minutes", `${admin.name} recorded minutes for “${n.title}”`, { entity: `notice:${id}` });
    changed();
    return { ok: "Minutes saved. Members see them under the notice." };
  });
}

export async function deleteNotice(id: string): Promise<void> {
  const admin = await requireAdmin();
  const n = await prisma.notice.delete({ where: { id } });
  await audit(admin.userId, "notice.deleted", `${admin.name} deleted the notice “${n.title}”`, { before: n });
  changed();
}
