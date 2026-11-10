"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resendLoginCode, verifyLoginCode, type LoginState } from "../actions";
import { inputClass, labelClass, primaryButton } from "@/components/ui";

export default function LoginCodePage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(verifyLoginCode, {});
  const [resent, resend, resending] = useActionState<LoginState, FormData>(async () => resendLoginCode(), {});
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-extrabold">Check WhatsApp</h1>
        <p className="mt-2 text-sm text-muted">We sent a 6-digit login code to your WhatsApp. It expires in 5 minutes.</p>
        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="code" className={labelClass}>Login code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus className={`${inputClass} text-center text-2xl tracking-[0.4em]`} />
          </div>
          {(state.error || resent.error) && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{state.error ?? resent.error}</p>}
          <button disabled={pending} className={`h-13 w-full ${primaryButton}`}>{pending ? "Checking…" : "Log in"}</button>
        </form>
        <form action={resend} className="mt-3">
          <button disabled={resending} className="h-11 w-full text-sm font-bold text-brand">Send a new code</button>
        </form>
        <p className="mt-4 text-center text-[13px]"><Link href="/login">Back</Link></p>
      </div>
    </div>
  );
}
