import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getSettings, money } from "@/lib/settings";
import { monthLabel } from "@/lib/months";
import { fmtDate } from "@/lib/format";
import { Icon } from "@/components/icons";
import { inputClass, labelClass, primaryButton } from "@/components/ui";

/**
 * FR-RCP-05: anyone can check that a receipt was really issued — the QR code
 * opens this page. Without logging in it shows only the receipt, amount and
 * date; the member's name is shown to signed-in users.
 */
export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const session = await getSession();
  const { code: raw } = await searchParams;
  const code = String(raw ?? "").trim().toUpperCase();
  const settings = await getSettings();
  const $ = (n: number) => money(n, settings.currencySymbol);

  let result: { ok: boolean; text: string } | null = null;
  if (code) {
    const r = await prisma.receipt.findFirst({ where: { OR: [{ verifyCode: code }, { receiptNo: code }] }, include: { member: { select: { name: true } }, payment: true } });
    if (!r) result = { ok: false, text: "No receipt with that code. It may be mistyped — or not issued by the society." };
    else if (r.cancelledAt) result = { ok: false, text: `Receipt ${r.receiptNo} was issued by ${settings.societyName} but CANCELLED on ${fmtDate(r.cancelledAt)}. It is no longer valid.` };
    else {
      const who = session ? ` ${r.kind === "DEPOSIT" ? "from" : "to"} ${r.member.name}` : "";
      const what = r.kind === "DEPOSIT" ? `deposit of ${$(r.amount)}${who}${r.payment ? ` for ${monthLabel(r.payment.forMonth, "long")}` : ""}` : `payout of ${$(r.amount)}${who}`;
      result = { ok: true, text: `Genuine. ${settings.societyName} receipt ${r.receiptNo}: ${what}, issued ${fmtDate(r.issuedAt)}.` };
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6">
      <div className="-ml-3 mb-4 flex items-center gap-1">
        <Link href={session ? (session.role === "MEMBER" ? "/member/profile" : "/admin") : "/login"} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-ink">
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
      {result && <p className={`mt-5 rounded-xl px-4 py-3 text-sm font-semibold leading-relaxed ${result.ok ? "bg-good-bg text-good" : "bg-bad-bg text-bad"}`}>{result.text}</p>}
    </div>
  );
}
