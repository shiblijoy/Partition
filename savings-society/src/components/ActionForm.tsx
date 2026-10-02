"use client";

import { useActionState, useEffect, useRef } from "react";
import { primaryButton } from "@/components/ui";

export type FormState = { error?: string; ok?: string };

/**
 * A form bound to a server action returning FormState: shows the error/success
 * message, disables the button while pending, and clears the inputs on success.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  buttonClass = primaryButton,
  resetOnSuccess = true,
  className = "space-y-3",
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  buttonClass?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">✓ {state.ok}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
