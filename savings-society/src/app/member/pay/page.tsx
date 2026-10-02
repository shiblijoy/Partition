import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { memberLedger } from "@/lib/ledger";
import { approvedTotalFor } from "@/lib/society";
import { addMonths } from "@/lib/months";
import { Card, PageHeader } from "@/components/ui";
import { PayForm } from "./PayForm";

export default async function PayPage() {
  const session = await requireMember();
  const [settings, member, approvedTotal] = await Promise.all([
    getSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId } }),
    approvedTotalFor(session.userId),
  ]);
  const ledger = memberLedger(member, approvedTotal, settings);

  // Suggest the first month not yet covered, and the amount that clears what's owed.
  const nextMonth = ledger.paidThrough ? addMonths(ledger.paidThrough, 1) : ledger.firstMonth;
  const suggestedAmount = ledger.due > 0 ? ledger.due : settings.monthlyAmount;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Submit a payment"
        subtitle={`Monthly deposit: ${money(settings.monthlyAmount, settings.currencySymbol)}. The admin will check the proof and approve it.`}
      />
      {settings.paymentInfo && (
        <div className="mb-4 whitespace-pre-line rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <p className="mb-1 font-semibold">Where to send money</p>
          {settings.paymentInfo}
        </div>
      )}
      <Card>
        <PayForm
          defaultMonth={nextMonth}
          defaultAmount={suggestedAmount}
          today={new Date().toISOString().slice(0, 10)}
        />
      </Card>
    </div>
  );
}
