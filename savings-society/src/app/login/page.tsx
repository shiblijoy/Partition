"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { inputClass, labelClass, primaryButton } from "@/components/ui";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-teal-50 to-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-3xl">💰</div>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Savings Society</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to submit deposits or manage the society.</p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="identifier" className={labelClass}>
              Phone or email
            </label>
            <input id="identifier" name="identifier" required autoComplete="username" className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </div>

          {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

          <button type="submit" disabled={pending} className={`w-full ${primaryButton}`}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">Forgot your password? Ask the admin to reset it.</p>
      </div>
    </div>
  );
}
