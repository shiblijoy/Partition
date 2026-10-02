"use client";

import { useActionState, useState } from "react";
import { changePassword, type PasswordState } from "@/app/login/password-actions";
import { Icon } from "@/components/icons";
import { inputClass, labelClass, primaryButton } from "@/components/ui";

const initialState: PasswordState = {};

export function ChangePasswordForm({ temporary = false }: { temporary?: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const checks: Array<[boolean, string]> = [
    [next.length >= 8, "At least 8 characters"],
    [/\d/.test(next), "Includes a number"],
    [next.length > 0 && next === confirm, "Both passwords match"],
  ];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="current" className={labelClass}>{temporary ? "Temporary password (from WhatsApp)" : "Current password"}</label>
        <input id="current" name="current" type="password" required autoComplete="current-password" className={inputClass} />
      </div>
      <div>
        <label htmlFor="next" className={labelClass}>New password</label>
        <input id="next" name="next" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="confirm" className={labelClass}>Type new password again</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {checks.map(([ok, label]) => (
          <li key={label} className={`flex items-center gap-2 ${ok ? "font-bold text-good" : "text-muted"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${ok ? "bg-good-bg" : "border-2 border-field"}`}>
              {ok && <Icon name="check" size={13} strokeWidth={3} />}
            </span>
            {label}
          </li>
        ))}
      </ul>
      {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm font-semibold text-good">Password changed. Other phones have been logged out.</p>}
      <button type="submit" disabled={pending} className={`w-full ${primaryButton}`}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
