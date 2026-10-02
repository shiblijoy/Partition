import { monthLabel } from "@/lib/months";
import type { MonthStatus } from "@/lib/ledger";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  INACTIVE: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function Badge({ label }: { label: string }) {
  const style = STATUS_STYLES[label] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {label.replaceAll("_", " ").toLowerCase()}
    </span>
  );
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
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const valueColor = {
    default: "text-slate-900",
    good: "text-emerald-700",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold sm:text-2xl ${valueColor}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

const MONTH_STYLES: Record<MonthStatus, string> = {
  paid: "bg-emerald-500 text-white",
  partial: "bg-amber-400 text-white",
  due: "bg-red-100 text-red-700 ring-1 ring-inset ring-red-200",
  upcoming: "bg-slate-100 text-slate-400",
  "before-join": "bg-slate-50 text-slate-300",
};

export function MonthCell({ month, status }: { month: string; status: MonthStatus }) {
  return (
    <div
      title={`${monthLabel(month, "long")}: ${status.replace("-", " ")}`}
      className={`rounded-md px-1 py-1.5 text-center text-[11px] font-medium ${MONTH_STYLES[status]}`}
    >
      {monthLabel(month).split(" ")[0]}
      <span className="block text-[10px] opacity-80">{month.slice(2, 4)}</span>
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
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
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
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";
export const labelClass = "block text-sm font-medium text-slate-700";
export const primaryButton =
  "rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60";
export const secondaryButton =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";

export const METHOD_LABELS: Record<string, string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  BANK: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};

export const CATEGORY_LABELS: Record<string, string> = {
  BANK_CHARGE: "Bank charge",
  TRANSFER_FEE: "Transfer fee",
  MEETING: "Meeting",
  STATIONERY: "Stationery",
  LEGAL: "Legal / registration",
  OTHER: "Other",
};
