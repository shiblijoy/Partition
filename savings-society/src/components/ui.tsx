import Link from "next/link";
import { monthLabel } from "@/lib/months";
import type { MonthStatus } from "@/lib/ledger";
import { Icon } from "@/components/icons";

export type Tone = "good" | "warn" | "bad" | "neutral" | "brand";

const TONE_STYLES: Record<Tone, string> = {
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  neutral: "bg-line text-muted",
  brand: "bg-brand text-white",
};

/** A rounded status chip. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${TONE_STYLES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS: Record<string, [Tone, string]> = {
  PENDING: ["warn", "Pending"],
  APPROVED: ["good", "Approved"],
  REJECTED: ["bad", "Rejected"],
  PAID: ["good", "Paid"],
  DECLINED: ["bad", "Declined"],
  CANCELLED: ["neutral", "Cancelled"],
  ACTIVE: ["good", "Active"],
  INACTIVE: ["neutral", "Inactive"],
  PROPOSED: ["warn", "Voting"],
  CLOSED: ["neutral", "Closed"],
  OPEN: ["warn", "Open"],
  DONE: ["neutral", "Done"],
};

/** Pill for one of the app's status enums. */
export function Badge({ label }: { label: string }) {
  const [tone, text] = STATUS[label] ?? ["neutral", label.replaceAll("_", " ").toLowerCase()];
  return <Pill tone={tone}>{text}</Pill>;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad" | "brand";
}) {
  if (tone === "brand") {
    return (
      <div className="rounded-2xl bg-brand p-4 text-white sm:p-5">
        <p className="text-[13px] font-semibold text-brand-soft">{label}</p>
        <p className="mt-1 text-xl font-extrabold sm:text-[26px]">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-brand-soft">{hint}</p>}
      </div>
    );
  }
  const valueColor = { default: "text-ink", good: "text-good", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className={`mt-1 text-xl font-extrabold sm:text-[26px] ${valueColor}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-extrabold sm:text-lg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <Link href={back.href} className="text-[13px] font-bold">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-extrabold sm:text-[28px]">{title}</h1>
        {subtitle && <p className="text-[13px] font-semibold text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Phone-style screen header with a back arrow, used on member sub-pages. */
export function ScreenHeader({ title, back }: { title: string; back: string }) {
  return (
    <div className="-ml-3 mb-4 flex items-center gap-1">
      <Link href={back} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-ink">
        <Icon name="back" size={22} />
      </Link>
      <h1 className="text-xl font-bold">{title}</h1>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function Notice({ tone = "good", children }: { tone?: "good" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  const style = {
    good: "bg-good-bg text-good",
    warn: "bg-warn-bg text-warn",
    bad: "bg-bad-bg text-bad",
    neutral: "bg-paper text-ink",
  }[tone];
  return <div className={`rounded-xl px-4 py-3 text-[13px] font-semibold leading-relaxed ${style}`}>{children}</div>;
}

/** Label / value pair in a summary grid. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-bold break-words">{children}</div>
    </div>
  );
}

/** A row of a settlement / statement breakdown. */
export function Line({ label, value, tone, total }: { label: React.ReactNode; value: string; tone?: "good" | "bad"; total?: boolean }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <div
      className={`flex justify-between gap-3 ${total ? "mt-1 border-t border-line pt-2 text-base font-extrabold" : "py-1 text-sm"}`}
    >
      <span>{label}</span>
      <span className={`text-right font-bold ${color}`}>{value}</span>
    </div>
  );
}

const MONTH_STYLES: Record<MonthStatus, string> = {
  paid: "bg-brand text-white",
  partial: "bg-[#C98A3A] text-white",
  due: "bg-bad-bg text-bad",
  upcoming: "bg-paper text-muted",
  "before-join": "bg-white text-field",
};

export function MonthCell({ month, status }: { month: string; status: MonthStatus }) {
  return (
    <div
      title={`${monthLabel(month, "long")}: ${status.replace("-", " ")}`}
      className={`rounded-lg px-1 py-1.5 text-center text-[11px] font-bold ${MONTH_STYLES[status]}`}
    >
      {monthLabel(month).split(" ")[0]}
      <span className="block text-[10px] font-semibold opacity-80">{month.slice(2, 4)}</span>
    </div>
  );
}

export function MonthLegend() {
  const items: Array<[MonthStatus, string]> = [
    ["paid", "Paid"],
    ["partial", "Part paid"],
    ["due", "Due"],
    ["upcoming", "Upcoming"],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
      {items.map(([status, label]) => (
        <span key={status} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded ${MONTH_STYLES[status]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

export const inputClass =
  "mt-1.5 block h-12 w-full rounded-xl border border-field bg-white px-3.5 text-[15px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
export const textareaClass =
  "mt-1.5 block w-full rounded-xl border border-field bg-white px-3.5 py-3 text-[15px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
export const fileClass =
  "mt-1.5 block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-paper file:px-4 file:text-sm file:font-bold file:text-ink";
export const labelClass = "block text-[13px] font-semibold text-muted";
export const primaryButton =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand px-5 text-[15px] font-bold text-white hover:bg-brand-dark disabled:opacity-60";
export const darkButton =
  "inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-[15px] font-bold text-white hover:bg-black disabled:opacity-60";
export const secondaryButton =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-field bg-white px-4 text-sm font-bold text-ink hover:bg-paper disabled:opacity-60";
export const smallButton =
  "inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3 text-[13px] font-bold text-white hover:bg-brand-dark disabled:opacity-60";
export const smallSecondary =
  "inline-flex h-9 items-center justify-center rounded-lg border border-field bg-white px-3 text-[13px] font-bold text-ink hover:bg-paper disabled:opacity-60";
export const dangerLink = "inline-flex h-9 items-center rounded-lg px-2 text-[13px] font-bold text-bad hover:bg-bad-bg";

export const METHOD_LABELS: Record<string, string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  BANK: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};

export const CATEGORY_LABELS: Record<string, string> = {
  BANK_CHARGE: "Bank charges",
  TRANSFER_FEE: "Transfer fee",
  MEETING: "Meeting",
  STATIONERY: "Printing & stationery",
  LEGAL: "Legal / registration",
  OTHER: "Other",
};

export const INVESTMENT_KIND_LABELS: Record<string, string> = { LAND: "Land", BUSINESS: "Business", SHARES: "Shares" };

export const VOTE_RULE_LABELS: Record<string, string> = {
  MAJORITY: "Majority",
  TWO_THIRDS: "Two-thirds",
  EVERYONE: "Everyone",
};

export const INCOME_LABELS: Record<string, string> = {
  INVESTMENT_PROFIT: "Investment profit",
  BANK_INTEREST: "Bank interest",
  FDR_PROFIT: "FDR profit",
  DONATION: "Donation",
  LATE_FEE: "Late fee",
  OTHER: "Other",
};

export const NOTICE_LABELS: Record<string, string> = {
  MEETING: "Meeting",
  VOTE: "Vote",
  REMINDER: "Reminder",
  DECISION: "Decision",
  GENERAL: "Notice",
};

export const ASSET_LABELS: Record<string, string> = { LAND: "Land", BUSINESS: "Business", SHARES: "Shares", SOCIETY: "Society" };
