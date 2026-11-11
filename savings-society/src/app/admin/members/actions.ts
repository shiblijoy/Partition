"use server";

import { redirect } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword, temporaryPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { getSettings, money } from "@/lib/settings";
import { isMonthKey, currentMonth, monthLabel } from "@/lib/months";
import { audit } from "@/lib/audit";
import { attempt, changed, dateField, text } from "@/lib/actions";
import { encryptPii, pii } from "@/lib/crypto";
import { revokeSessions } from "@/lib/session";
import { sendTemplate } from "@/lib/messaging";
import { queueNotification } from "@/lib/notify";
import { membersWithLedgers } from "@/lib/society";
import { resplitFrom } from "@/lib/books";
import { EDITABLE_FIELDS, FIELD_LABELS, parseChanges, validateField, type EditableField } from "@/lib/profile-fields";
import { recordForMember } from "@/lib/services/payments";
import { ServiceError } from "@/lib/errors";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

const actorOf = (v: { userId: string; name: string }) => ({ id: v.userId, name: v.name });

async function duplicatePhone(phone: string, exceptId?: string): Promise<boolean> {
  return !!(await prisma.user.findFirst({ where: { phone, ...(exceptId ? { NOT: { id: exceptId } } : {}) } }));
}

/** UC-01: sent by WhatsApp or SMS when one is set up; otherwise the admin sees the password once to give in person. */
async function sendPassword(user: { id: string; name: string; phone: string }, password: string, first: boolean): Promise<FormState> {
  const channel = await sendTemplate(user.phone, "temp_password", [user.name.split(" ")[0], password], user.id);
  if (channel) return { ok: `${first ? `${user.name} added. ` : ""}The temporary password was sent by ${channel === "WHATSAPP" ? "WhatsApp" : "SMS"}.` };
  return { ok: `${first ? `${user.name} added. ` : ""}Temporary password (shown once, give it to ${user.name.split(" ")[0]}): ${password} · They log in with ${user.phone}.` };
}

const nomineeFields = (formData: FormData) => ({
  nomineeName: text(formData, "nomineeName"),
  nomineeRelation: text(formData, "nomineeRelation"),
  nomineePhone: text(formData, "nomineePhone"),
  nomineeNid: text(formData, "nomineeNid"),
});

/**
 * FR-MEM-01/02, UC-01: adds a member with a joining rule and a temporary
 * password sent on WhatsApp (SMS fallback). BR-13: a nominee is required.
 */
export async function addMember(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const settings = await getSettings();
    const name = text(formData, "name") ?? "";
    const phone = normalizePhone(text(formData, "phone") ?? "");
    const rule = String(formData.get("rule") ?? "fresh");
    const firstMonth = String(formData.get("joinMonth") ?? "");
    const nominee = nomineeFields(formData);

    if (!name) return { error: "Name is required." };
    if (!/^\+?\d{10,14}$/.test(phone)) return { error: "Enter a valid mobile number." };
    if (rule === "fresh" && !isMonthKey(firstMonth)) return { error: "Choose their first month." };
    if (!nominee.nomineeName || !nominee.nomineeRelation || !nominee.nomineePhone) return { error: "Every member needs a nominee: enter the nominee's name, relation and mobile number." };
    for (const f of ["nomineePhone", "nomineeNid"] as const) {
      const e = validateField(f, nominee[f]);
      if (e) return { error: e };
    }
    if (await duplicatePhone(phone)) return { error: "Another account already uses that mobile number." };

    const password = temporaryPassword();
    const last = await prisma.user.aggregate({ _max: { memberNo: true } });
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        joinMonth: rule === "catchup" ? settings.startMonth : firstMonth,
        joiningRule: rule === "catchup" ? "PAY_BACK" : "FRESH",
        memberNo: (last._max.memberNo ?? 0) + 1,
        role: "MEMBER",
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        ...encryptPii(nominee),
      },
    });
    // A member who starts from an earlier month shares the costs and profits since then.
    if (user.joiningRule === "FRESH") await resplitFrom(prisma, user.joinMonth);
    await audit(admin.userId, "member.added", `${admin.name} added ${name} (${phone})${rule === "catchup" ? ", paying back all past months" : ""}`, { entity: `user:${user.id}`, after: { name, phone, joinMonth: user.joinMonth, joiningRule: user.joiningRule } });
    changed();
    return sendPassword(user, password, true);
  });
}

export async function updateMember(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const name = text(formData, "name") ?? "";
    const phone = normalizePhone(text(formData, "phone") ?? "");
    const joinMonth = String(formData.get("joinMonth") ?? "");
    if (!name) return { error: "Name is required." };
    if (!/^\+?\d{10,14}$/.test(phone)) return { error: "Enter a valid mobile number." };
    if (!isMonthKey(joinMonth)) return { error: "Choose a valid first month." };
    if (await duplicatePhone(phone, memberId)) return { error: "Another account already uses that mobile number." };
    const details = Object.fromEntries(EDITABLE_FIELDS.map(([f]) => [f, text(formData, f)])) as Record<EditableField, string | null>;
    for (const [f] of EDITABLE_FIELDS) {
      const e = validateField(f, details[f]);
      if (e) return { error: e };
    }
    const before = pii(await prisma.user.findUniqueOrThrow({ where: { id: memberId } }));
    await prisma.user.update({ where: { id: memberId }, data: { name, phone, joinMonth, ...encryptPii(details) } });
    if (before.joinMonth !== joinMonth && before.joiningRule === "FRESH") await resplitFrom(prisma, joinMonth < before.joinMonth ? joinMonth : before.joinMonth);
    const changedFields = [
      ...(before.name !== name ? ["name"] : []),
      ...(before.phone !== phone ? ["mobile"] : []),
      ...(before.joinMonth !== joinMonth ? ["first month"] : []),
      ...EDITABLE_FIELDS.filter(([f]) => (before[f] ?? null) !== details[f]).map(([, l]) => l.toLowerCase()),
    ];
    // NID and nominee values stay out of the log (they're personal data); names of changed fields go in.
    await audit(admin.userId, "member.updated", `${admin.name} updated ${name}'s details: ${changedFields.join(", ") || "no change"}`, {
      entity: `user:${memberId}`,
      before: { name: before.name, phone: before.phone, joinMonth: before.joinMonth },
      after: { name, phone, joinMonth },
    });
    changed();
    return { ok: "Saved." };
  });
}

/** FR-AUTH-09 / UC-08: a new temporary password, sent on WhatsApp; every session of the member ends. */
export async function resetPassword(memberId: string): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const password = temporaryPassword();
    const member = await prisma.user.update({
      where: { id: memberId },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
    });
    await revokeSessions(member.id);
    await audit(admin.userId, "member.password_reset", `${admin.name} reset ${member.name}'s password; all their sessions were ended`, { entity: `user:${memberId}` });
    return sendPassword(member, password, false);
  });
}

export async function unlockAccount(memberId: string): Promise<void> {
  const admin = await requireAdmin();
  const m = await prisma.user.update({ where: { id: memberId }, data: { lockedUntil: null, failedLogins: 0 } });
  await audit(admin.userId, "member.unlocked", `${admin.name} unlocked ${m.name}'s account`, { entity: `user:${memberId}` });
  changed();
}

/** FR-PAY-11 / UC-09: money received directly, approved at once with a receipt per month. */
export async function recordPayment(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const settings = await getSettings();
    const months = [...new Set(formData.getAll("months").map(String))].filter(isMonthKey).sort();
    const method = String(formData.get("method") ?? "") as PaymentMethod;
    if (months.length === 0) return { error: "Pick at least one month." };
    if (method !== PaymentMethod.BANK) return { error: "Only bank payments are accepted." };
    let proofPath: string | null = null;
    const proof = formData.get("proof");
    if (proof instanceof File && proof.size > 0) {
      try {
        proofPath = await saveFile(`proofs/${memberId}`, proof);
      } catch (err) {
        if (err instanceof UploadError) return { error: err.message };
        throw err;
      }
    }
    const r = await recordForMember(settings, {
      memberId,
      months,
      method,
      reference: text(formData, "reference"),
      receivedOn: dateField(formData, "paidOn"),
      proofPath,
      accountId: text(formData, "accountId"),
      actor: actorOf(admin),
    });
    changed();
    return {
      ok: `Recorded and approved. ${r.months.length} receipt${r.months.length > 1 ? "s" : ""} issued.${r.skipped.length ? ` Skipped ${r.skipped.map((m) => monthLabel(m)).join(", ")}: already paid or waiting for approval.` : ""}`,
    };
  });
}

/** FR-MEM-05: removing a member opens a settlement, like a full withdrawal. */
export async function removeMember(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const r = await attempt(async () => {
    const admin = await requireAdmin();
    const reason = text(formData, "reason");
    if (!reason) return { error: "Give a reason (it's kept in the audit log)." };
    const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    if (await prisma.withdrawal.findFirst({ where: { memberId, status: { in: ["PENDING", "APPROVED"] } } })) return { error: "This member already has a settlement open." };
    const w = await prisma.withdrawal.create({ data: { memberId, kind: "FULL", exitAs: "REMOVED", payTo: "Bank account to be confirmed with the member", reason, adminNote: `Removed by ${admin.name}` } });
    await audit(admin.userId, "member.removed", `${admin.name} started removing ${member.name}: ${reason}`, { entity: `user:${memberId}` });
    changed();
    return { ok: w.id };
  });
  if (r.ok) redirect(`/admin/withdrawals/${r.ok}`);
  return r;
}

/** FR-MEM-09 / UC-11: records a death and opens a full settlement payable to the nominee. */
export async function markDeceased(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const r = await attempt(async () => {
    const admin = await requireAdmin();
    const died = dateField(formData, "date");
    const member = pii(await prisma.user.findUniqueOrThrow({ where: { id: memberId } }));
    if (!member.nomineeName) throw new ServiceError("Add the nominee's details first (Edit details below). With no nominee, the committee decides; record it in the notes.");
    let attachmentPath: string | null = null;
    const certificate = formData.get("certificate");
    if (!(certificate instanceof File) || certificate.size === 0) throw new ServiceError("Attach the death certificate.");
    try {
      attachmentPath = await saveFile("statements/deaths", certificate);
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message };
      throw err;
    }
    await prisma.withdrawal.updateMany({ where: { memberId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "CANCELLED" } });
    const w = await prisma.withdrawal.create({
      data: { memberId, kind: "NOMINEE", exitAs: "DECEASED", payTo: `${member.nomineeName}${member.nomineePhone ? ` · ${member.nomineePhone}` : ""}`, reason: `Died ${died.toISOString().slice(0, 10)}`, attachmentPath },
    });
    await prisma.user.update({ where: { id: memberId }, data: { active: false, deceasedOn: died } });
    await revokeSessions(memberId);
    await audit(admin.userId, "member.deceased", `${admin.name} recorded the death of ${member.name}; settlement to the nominee opened`, { entity: `user:${memberId}` });
    changed();
    return { ok: w.id };
  });
  if (r.ok) redirect(`/admin/withdrawals/${r.ok}`);
  return r;
}

/** FR-MEM-06: brings back a member removed by mistake, before their settlement is paid. */
export async function restoreMember(memberId: string): Promise<void> {
  const admin = await requireAdmin();
  const paid = await prisma.withdrawal.findFirst({ where: { memberId, status: "PAID", kind: { in: ["FULL", "NOMINEE"] } } });
  if (paid) return; // settled: restoring would pay them twice
  await prisma.withdrawal.updateMany({ where: { memberId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "CANCELLED" } });
  await prisma.allocation.updateMany({ where: { memberId }, data: { frozen: false } });
  const member = await prisma.user.update({ where: { id: memberId }, data: { active: true, exit: null, exitedAt: null, deceasedOn: null } });
  await audit(admin.userId, "member.restored", `${admin.name} restored ${member.name}`, { entity: `user:${memberId}` });
  changed();
}

export async function closeRequest(requestId: string): Promise<void> {
  await requireAdmin();
  await prisma.memberRequest.update({ where: { id: requestId }, data: { status: "DONE" } });
  changed();
}

/** Applies a member's proposed edits to their details. */
export async function approveDetailsChange(requestId: string): Promise<void> {
  const admin = await requireAdmin();
  const request = await prisma.memberRequest.findUnique({ where: { id: requestId }, include: { member: true } });
  if (!request || request.status !== "OPEN" || !request.changes) return;
  const changes = parseChanges(request.changes);
  const data: Partial<Record<EditableField, string | null>> = {};
  for (const field of Object.keys(changes) as EditableField[]) {
    if (!EDITABLE_FIELDS.some(([f]) => f === field)) continue;
    const to = changes[field]?.to ?? null;
    if (validateField(field, to)) continue;
    data[field] = to;
  }
  await prisma.user.update({ where: { id: request.memberId }, data: encryptPii(data) });
  await prisma.memberRequest.update({ where: { id: requestId }, data: { status: "APPROVED", decidedAt: new Date() } });
  await queueNotification(prisma, { userId: request.memberId, kind: "details", title: "Details updated", body: "The admin approved the changes to your details.", url: "/member/profile" });
  await audit(admin.userId, "member.details_approved", `${admin.name} approved ${request.member.name}'s edit: ${Object.keys(data).map((f) => FIELD_LABELS[f as EditableField].toLowerCase()).join(", ")}`, { entity: `user:${request.memberId}` });
  changed();
}

export async function rejectDetailsChange(requestId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const note = text(formData, "note");
    if (!note) return { error: "Tell the member why, so they can fix it." };
    const request = await prisma.memberRequest.findUnique({ where: { id: requestId }, include: { member: true } });
    if (!request || request.status !== "OPEN") return { error: "This request has already been handled." };
    await prisma.memberRequest.update({ where: { id: requestId }, data: { status: "REJECTED", adminNote: note, decidedAt: new Date() } });
    await queueNotification(prisma, { userId: request.memberId, kind: "details", title: "Details change not accepted", body: note, url: "/member/profile" });
    await audit(admin.userId, "member.details_rejected", `${admin.name} rejected ${request.member.name}'s edit: ${note}`, { entity: `user:${request.memberId}` });
    changed();
    return { ok: "Rejected. The member sees your reason." };
  });
}

/** FR-DSH-04: remind one or all unpaid members (in the app, by push, and on WhatsApp when connected). */
export async function remindMembers(memberIds: string[] | "all"): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const settings = await getSettings();
    const month = currentMonth();
    const owing = (await membersWithLedgers(settings)).filter((m) => m.ledger.due > 0 && (memberIds === "all" || memberIds.includes(m.id)));
    for (const m of owing) {
      const amount = money(m.ledger.due, settings.currencySymbol);
      await queueNotification(prisma, {
        userId: m.id,
        kind: "reminder",
        title: "Deposit due",
        body: `You owe ${amount}. Please pay and upload the proof in the app.`,
        url: "/member/pay",
        whatsapp: { template: "payment_due", params: [m.name.split(" ")[0], monthLabel(month, "long"), amount] },
      });
    }
    await audit(admin.userId, "members.reminded", `${admin.name} sent a payment reminder to ${owing.length} member(s)`);
    changed();
    return { ok: `Reminder sent to ${owing.length} member${owing.length === 1 ? "" : "s"}.` };
  });
}

export async function remindAll(): Promise<FormState> {
  return remindMembers("all");
}
