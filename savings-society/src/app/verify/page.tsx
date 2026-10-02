import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";
import { Icon } from "@/components/icons";
import { inputClass, labelClass, primaryButton } from "@/components/ui";

/** Anyone signed in can check that a deposit or payout receipt was really issued by the society. */
export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const session = await requireSession();
  const { code: raw } = await searchParams;
  const code = String(raw ?? "").trim().toUpperCase();
  const settings = await getSettings();
  const $ = (n: number) => money(n, settings.currencySymbol);

  let result: { ok: boolean; text: string } | null = null;
  if (code) {
    const payment = await prisma.payment.findFirst({
      where: { status: "APPROVED", OR: [{ verifyCode: code }, { receiptNo: code }] },
      include: { member: { select: { name: true } } },
    });
    const payout = payment ? null : await prisma.withdrawal.findFirst({ where: { receiptNo: code, status: "PAID" }, include: { member: { select: { name: true } } } });
    if (payment) {
      result = { ok: true, text: `Genuine. Receipt ${payment.receiptNo}: ${$(payment.amount)} from ${payment.member.name} for ${monthLabel(payment.forMonth, "long")}, approved ${payment.reviewedAt ? fmtDate(payment.reviewedAt) : ""}.` };
    } else if (payout) {
      result = { ok: true, text: `Genuine. Payout ${payout.receiptNo}: ${$(payout.payable ?? 0)} paid to ${payout.member.name} on ${payout.paidAt ? fmtDate(payout.paidAt) : ""}.` };
    } else {
      result = { ok: false, text: "No receipt with that code. It may be mistyped — or not issued by the society." };
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6">
      <div className="-ml-3 mb-4 flex items-center gap-1">
        <Link href={session.role === "ADMIN" ? "/admin" : "/member/profile"} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-ink">
          <Icon name="back" size={22} />
        </Link>
        <h1 className="text-xl font-bold">Check a receipt</h1>
      </div>
      <form className="flex flex-col gap-4">
        <div>
          <label htmlFor="code" className={labelClass}>Code or receipt number</label>
          <input id="code" name="code" defaultValue={code} required placeholder="e.g. 7F3K-Q9" autoCapitalize="characters" className={inputClass} />
        </div>
        <button className={`w-full ${primaryButton}`}>Check</button>
      </form>
      {result && (
        <p className={`mt-5 rounded-xl px-4 py-3 text-sm font-semibold leading-relaxed ${result.ok ? "bg-good-bg text-good" : "bg-bad-bg text-bad"}`}>{result.text}</p>
      )}
    </div>
  );
}
