"use client";

import { useActionState, useEffect, useRef } from "react";
import { primaryButton } from "@/components/ui";

export type FormState = { error?: string; ok?: string; link?: { href: string; label: string } };

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
  className = "flex flex-col gap-4",
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
      {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm font-semibold text-good">{state.ok}</p>}
      {state.link && (
        <a href={state.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-brand px-4 text-sm font-bold no-underline">
          {state.link.label}
        </a>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
