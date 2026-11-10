import { PaymentMethod } from "@prisma/client";
import { getSettings } from "@/lib/settings";
import { isMonthKey } from "@/lib/months";
import { saveFile, UploadError } from "@/lib/uploads";
import { duplicateReference, submitPayments } from "@/lib/services/payments";
import { ServiceError } from "@/lib/errors";

export type PayState = { error?: string; warning?: string };

/** Shared by the Pay form and the offline queue's upload route. */
export async function handleSubmission(memberId: string, formData: FormData): Promise<PayState & { ok?: boolean }> {
  const settings = await getSettings();
  const months = [...new Set(formData.getAll("months").map(String))].filter(isMonthKey).sort();
  const method = String(formData.get("method") ?? "") as PaymentMethod;
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase() || null;
  const paidOnRaw = String(formData.get("paidOn") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const proof = formData.get("proof");
  const confirmed = formData.get("confirmDuplicate") === "on" || formData.get("offline") === "1";

  if (months.length === 0) return { error: "Pick the month (or months) you're paying for." };
  if (!Object.values(PaymentMethod).includes(method)) return { error: "Choose how you paid." };
  if (method !== "CASH" && !reference) return { error: "Enter the transaction ID or reference so the admin can find it." };
  if (!(proof instanceof File) || proof.size === 0) return { error: "Add a screenshot or photo of your payment receipt." };

  // FR-PAY-09 / UC-03: a transaction ID used before is a warning; the member may still send it with a note.
  if (reference && (await duplicateReference(reference)).length > 0) {
    if (!confirmed) return { warning: "This transaction ID was already used for another payment. Check it, or tick the box and add a note for the admin if it's right." };
    if (!note && formData.get("offline") !== "1") return { warning: "Add a note explaining why the transaction ID repeats." };
  }

  let proofPath: string;
  try {
    proofPath = await saveFile(`proofs/${memberId}`, proof);
  } catch (err) {
    if (err instanceof UploadError) return { error: err.message };
    throw err;
  }
  const paidOn = paidOnRaw ? new Date(`${paidOnRaw}T12:00:00`) : new Date();
  try {
    await submitPayments(settings, { memberId, months, method, reference, paidOn, proofPath, note });
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
  return { ok: true };
}
