"use server";

import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { attempt, changed } from "@/lib/actions";
import { isMonthKey, monthLabel } from "@/lib/months";
import { closeMonth as close, type ReconInput } from "@/lib/services/reconcile";
import { saveFile, UploadError } from "@/lib/uploads";
import type { FormState } from "@/components/ActionForm";

/** UC-10: each account's real closing balance with its statement; every difference explained; then the month locks. */
export async function closeMonth(month: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async () => {
    const admin = await requireAdmin();
    if (!isMonthKey(month)) return { error: "Unknown month." };
    const ids = formData.getAll("accountId").map(String);
    const lines: ReconInput[] = [];
    for (const [i, accountId] of ids.entries()) {
      const raw = String(formData.getAll("actual")[i] ?? "");
      if (raw === "") return { error: "Enter every account's closing balance (0 if empty)." };
      let statementPath: string | null = null;
      const file = formData.getAll("statement")[i];
      if (file instanceof File && file.size > 0) {
        try {
          statementPath = await saveFile("statements/bank", file);
        } catch (err) {
          if (err instanceof UploadError) return { error: err.message };
          throw err;
        }
      }
      const fix = String(formData.get(`fix-${accountId}`) ?? "none");
      lines.push({ accountId, actual: Number(raw), note: String(formData.get(`note-${accountId}`) ?? "").trim() || null, fix: fix === "charge" || fix === "interest" ? fix : "none", statementPath });
    }
    if (lines.length === 0) return { error: "Add a society account first." };
    await close(await getSettings(), month, lines, { id: admin.userId, name: admin.name });
    changed();
    return { ok: `${monthLabel(month, "long")} is closed and locked. Corrections now go into an open month as new entries.` };
  });
}
