"use server";

import { AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { attempt, changed, dateField, text } from "@/lib/actions";
import { cashAt } from "@/lib/books";
import { audit } from "@/lib/audit";
import { addAccount as add, transfer } from "@/lib/services/books";
import type { FormState } from "@/components/ActionForm";

const actorOf = (v: { userId: string; name: string }) => ({ id: v.userId, name: v.name });

export async function addAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const type = String(formData.get("type") ?? "") as AccountType;
    if (!Object.values(AccountType).includes(type) || type === "FDR") return { error: "Choose the account type (FDRs are opened from Income & FDRs)." };
    await add({ name: text(formData, "name") ?? "", type, last4: text(formData, "last4"), openingBalance: Math.round(Number(formData.get("openingBalance") || 0)), actor: actorOf(admin) });
    changed();
    return { ok: "Account added." };
  });
}

export async function moveMoney(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    await transfer({ fromId: text(formData, "fromId") ?? "", toId: text(formData, "toId") ?? "", amount: Number(formData.get("amount")), date: dateField(formData, "date"), note: text(formData, "note"), actor: actorOf(admin) });
    changed();
    return { ok: "Moved. Total cash is unchanged; only the two balances moved." };
  });
}

/** Closes an empty account (its history stays in the ledger). */
export async function closeAccount(id: string): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    if ((await cashAt(prisma, undefined, id)) !== 0) return { error: "Move the balance out first: only an empty account can be closed." };
    const a = await prisma.account.update({ where: { id }, data: { active: false, closedOn: new Date() } });
    await audit(admin.userId, "account.closed", `${admin.name} closed the account ${a.name}`, { entity: `account:${id}` });
    changed();
    return { ok: "Closed." };
  });
}
