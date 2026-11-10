"use client";

import { createContext, useContext } from "react";
import { translate, type T } from "@/lib/i18n";

const LangContext = createContext("en");

export function I18nProvider({ lang, children }: { lang: string; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): string {
  return useContext(LangContext);
}

export function useT(): T {
  const lang = useContext(LangContext);
  return (key, vars) => translate(lang, key, vars);
}
