import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { ServiceError } from "@/lib/errors";
import { deliver } from "@/lib/deliver";
import type { FormState } from "@/components/ActionForm";

/** Runs a change; a ServiceError becomes the form's error message instead of an error page. */
export async function attempt(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
}

/** After any change: refresh both apps and send queued notifications once the response is out. */
export function changed() {
  revalidatePath("/admin", "layout");
  revalidatePath("/member", "layout");
  after(() => deliver().catch((err) => console.error("deliver", err)));
}

export const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

export function dateField(formData: FormData, key: string, fallback = new Date()): Date {
  const raw = String(formData.get(key) ?? "");
  if (!raw) return fallback;
  const d = new Date(`${raw}T12:00:00`); // noon local: a date input never slips into the previous day
  if (Number.isNaN(d.getTime())) throw new ServiceError("Enter a valid date.");
  return d;
}
