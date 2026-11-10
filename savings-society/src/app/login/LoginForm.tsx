"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { chooseLanguage, login, type LoginState } from "./actions";
import { inputClass, labelClass, primaryButton } from "@/components/ui";
import { translate } from "@/lib/i18n";

const initialState: LoginState = {};

export function LoginForm({ initialLang }: { initialLang: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [show, setShow] = useState(false);
  const [lang, setLang] = useState(initialLang);
  const t = (k: string) => translate(lang, k);
  const pick = (l: string) => {
    setLang(l);
    chooseLanguage(l);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-end gap-1 text-[13px]">
          {[["en", "English"], ["bn", "বাংলা"]].map(([l, label]) => (
            <button key={l} type="button" onClick={() => pick(l)} aria-pressed={lang === l} className={`h-9 rounded-lg px-3 ${lang === l ? "bg-white font-bold shadow-sm ring-1 ring-line" : "font-semibold text-muted"}`}>{label}</button>
          ))}
        </div>
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl font-extrabold text-white">৳</span>
          <h1 className="text-[28px] font-extrabold">Dreamhive</h1>
          <p className="text-sm font-semibold text-muted">{t("Savings society · members only")}</p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div>
            <label htmlFor="identifier" className={labelClass}>{t("Mobile number")}</label>
            <input id="identifier" name="identifier" type="text" inputMode="tel" required autoComplete="username" placeholder="01XXX-XXXXXX" className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>{t("Password")}</label>
            <div className="relative">
              <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" className={`${inputClass} pr-20`} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1/2 mt-[3px] h-10 -translate-y-1/2 rounded-lg px-3 text-[13px] font-bold text-brand">
                {show ? t("Hide") : t("Show")}
              </button>
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input type="checkbox" name="remember" defaultChecked className="h-5 w-5 accent-brand" />
            {t("Keep me logged in on this phone")}
          </label>

          {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{t(state.error)}</p>}

          <button type="submit" disabled={pending} className={`h-13 w-full ${primaryButton}`}>
            {pending ? t("Logging in…") : t("Log in")}
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-3 text-center text-[13px] leading-relaxed text-muted">
          <p>
            <span className="font-bold text-ink">{t("Forgot your password?")}</span> {t("Ask your admin to reset it. You'll get a temporary password on WhatsApp.")}
          </p>
          <p>{t("No account? Only the admin can add members.")}</p>
          <p className="flex justify-center gap-4"><Link href="/privacy">{t("Privacy policy")}</Link><Link href="/verify">{t("Check a receipt")}</Link></p>
        </div>
      </div>
    </div>
  );
}
