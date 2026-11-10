"use server";

import { IncomeKind } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { attempt, changed, dateField, text } from "@/lib/actions";
import { addIncome as add, closeFdr as close, openFdr as open, reverseIncome } from "@/lib/services/books";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

const actorOf = (v: { userId: string; name: string }) => ({ id: v.userId, name: v.name });

/** FR-INC-01/03: other income with date, amount, account and proof, shared with members. */
export async function addIncome(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const kind = String(formData.get("kind") ?? "") as IncomeKind;
    if (!Object.values(IncomeKind).includes(kind)) return { error: "Choose the type." };
    let filePath: string | null = null;
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        filePath = await saveFile("statements/income", file);
      } catch (err) {
        if (err instanceof UploadError) return { error: err.message };
        throw err;
      }
    }
    await add(await getSettings(), { kind, amount: Number(formData.get("amount")), date: dateField(formData, "date"), accountId: text(formData, "accountId"), description: text(formData, "description") ?? "", filePath, actor: actorOf(admin) });
    changed();
    return { ok: "Income recorded and shared with members." };
  });
}

export async function reverse(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await reverseIncome(await getSettings(), id, text(formData, "reason") ?? "", actorOf(admin));
    changed();
    return { ok: "Reversed." };
  });
}

/** FR-INC-04: moving money into an FDR is a transfer between the society's accounts, not an expense. */
export async function openFdr(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await open({
      fromId: text(formData, "fromId") ?? "",
      name: text(formData, "bank") ?? "",
      amount: Number(formData.get("amount")),
      rate: Number(formData.get("rate")) || null,
      openedOn: dateField(formData, "openedOn"),
      maturesOn: dateField(formData, "maturesOn"),
      actor: actorOf(admin),
    });
    changed();
    return { ok: "FDR opened. The money moved from the account into the FDR; total cash is unchanged." };
  });
}

export async function closeFdr(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await close({ fdrId: id, toId: text(formData, "toId") ?? "", date: dateField(formData, "date"), actor: actorOf(admin) });
    changed();
    return { ok: "FDR closed and its balance moved back." };
  });
}
