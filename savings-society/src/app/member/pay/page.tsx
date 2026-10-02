import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { approvedTotalFor } from "@/lib/society";
import { addMonths, monthLabel } from "@/lib/months";
import { dateInput } from "@/lib/format";
import { ScreenHeader } from "@/components/ui";
import { PayForm } from "./PayForm";

export default async function PayPage() {
  const session = await requireMember();
  const [settings, member, approvedTotal, pending] = await Promise.all([
    getSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    approvedTotalFor(session.userId),
    prisma.payment.findMany({ where: { memberId: session.userId, status: "PENDING" } }),
  ]);
  const ledger = memberLedger(member, approvedTotal, settings);

  // Offer the months not yet covered by approved or pending money, oldest first.
  const pendingMonths = pending.reduce((n, p) => n + p.monthsCount, 0);
  const firstOpen = addMonths(ledger.paidThrough ? addMonths(ledger.paidThrough, 1) : ledger.firstMonth, pendingMonths);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(firstOpen, i)).map((key) => ({
    key,
    label: monthLabel(key),
    due: ledger.statusFor(key) === "due",
  }));

  return (
    <div>
      <ScreenHeader title="Submit payment" back="/member" />
      <PayForm
        months={months}
        monthly={settings.monthlyAmount}
        currency={settings.currencySymbol}
        monthlyLabel={money(settings.monthlyAmount, settings.currencySymbol)}
        paymentInfo={settings.paymentInfo}
        today={dateInput()}
      />
    </div>
  );
}
