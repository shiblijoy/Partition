"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "@/app/login/password-actions";
import { inputClass, labelClass, primaryButton } from "@/components/ui";

const initialState: PasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="current" className={labelClass}>Current password</label>
        <input id="current" name="current" type="password" required autoComplete="current-password" className={inputClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="next" className={labelClass}>New password</label>
          <input id="next" name="next" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </div>
        <div>
          <label htmlFor="confirm" className={labelClass}>Confirm new password</label>
          <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">✓ Password changed.</p>}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
