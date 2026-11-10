import { BN } from "@/lib/i18n/bn";

/**
 * NFR-USE-02: the member app in Bangla or English; the member picks. Strings
 * are written in English in the code and looked up in the Bangla dictionary;
 * anything missing falls back to English. The admin console stays in English.
 */
export type Lang = "en" | "bn";
export type Vars = Record<string, string | number>;

export function translate(lang: string, key: string, vars?: Vars): string {
  const template = lang === "bn" ? (BN[key] ?? key) : key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : template;
}

export type T = (key: string, vars?: Vars) => string;

export function tFor(lang: string): T {
  return (key, vars) => translate(lang, key, vars);
}

const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const EN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Oct 2026" / "October 2026" / "অক্টোবর 2026". */
export function monthName(key: string, lang: string, style: "short" | "long" = "short"): string {
  const [y, m] = key.split("-").map(Number);
  if (lang === "bn") return `${BN_MONTHS[m - 1]} ${y}`;
  return `${(style === "long" ? EN_LONG : EN_SHORT)[m - 1]} ${y}`;
}

/** "2 Oct 2026" / "2 অক্টোবর 2026" (FR §6.1 date style). */
export function dateName(date: Date, lang: string, withYear = true): string {
  if (lang !== "bn") return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  return `${date.getDate()} ${BN_MONTHS[date.getMonth()]}${withYear ? ` ${date.getFullYear()}` : ""}`;
}
