import Link from "next/link";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { yearStatement } from "@/lib/statement";
import { tFor, monthName, dateName } from "@/lib/i18n";
import { Line, ScreenHeader, primaryButton } from "@/components/ui";

export default async function StatementPage({ searchParams }: PageProps<"/member/statement">) {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const { year: raw } = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = Math.min(thisYear, Math.max(2000, Number(raw) || thisYear));
  const [settings, s] = await Promise.all([getSettings(), yearStatement(viewer.userId, year)]);
  const $ = (n: number) => money(n, settings.currencySymbol);

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title={t("Statement {year}", { year })} back="/member/history" />
      <nav className="flex gap-2" aria-label={t("Year")}>
        {[thisYear - 2, thisYear - 1, thisYear].map((y) => (
          <Link key={y} href={`/member/statement?year=${y}`} aria-current={y === year ? "page" : undefined} className={`flex h-10 items-center rounded-full px-4 text-[13px] no-underline ${y === year ? "bg-ink font-bold text-white" : "border border-field bg-white font-semibold text-muted"}`}>{y}</Link>
        ))}
      </nav>
      <div className="flex flex-col rounded-2xl border border-line bg-white px-4 py-3">
        {s.payments.map((p) => (
          <Line key={p.id} label={`${monthName(p.forMonth, viewer.language, "long")} · ${p.receipt?.receiptNo ?? ""}${p.receivedOn ? ` · ${dateName(p.receivedOn, viewer.language, false)}` : ""}`} value={$(p.amount)} />
        ))}
        {s.payments.length === 0 && <p className="py-2 text-sm text-muted">{t("No approved deposits this year.")}</p>}
        <Line label={t("Deposits in {year}", { year })} value={$(s.deposits)} total />
        <Line label={t("+ Profit share")} value={`+ ${$(s.profitShare)}`} tone="good" />
        <Line label={t("− Cost share")} value={`− ${$(s.costShare)}`} tone="bad" />
        <Line label={t("Net value today")} value={$(s.position.net)} total />
      </div>
      <a href={`/member/statement/pdf?year=${year}`} target="_blank" rel="noopener" className={`${primaryButton} no-underline`}>{t("Download PDF")}</a>
    </div>
  );
}
